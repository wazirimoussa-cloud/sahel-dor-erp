-- Unités de mesure par produit (tonne pour céréales/légumineuses/sucre, carton/bidon
-- pour l'huile) et passage des quantités/stock de integer à numeric(12,3) pour accepter
-- des quantités décimales (Sahel d'Or est un grossiste — cf. README).

-- 1. Colonne "unité" sur products.
alter table public.products
  add column unit text not null default 'unité'
  check (unit in ('tonne', 'carton', 'bidon', 'unité'));

-- 2. Conversion des colonnes quantité/stock en numeric (les contraintes CHECK existantes
--    restent valides telles quelles, Postgres les réévalue automatiquement).
alter table public.order_items alter column quantity type numeric(12, 3);
alter table public.transactions alter column quantity type numeric(12, 3);
alter table public.purchase_items alter column quantity type numeric(12, 3);
alter table public.production_items alter column quantity type numeric(12, 3);
alter table public.transformation_inputs alter column quantity type numeric(12, 3);
alter table public.transformation_outputs alter column quantity type numeric(12, 3);
alter table public.purchase_losses alter column quantity_lost type numeric(12, 3);
alter table public.product_stocks alter column stock type numeric(12, 3);
alter table public.products alter column stock type numeric(12, 3);

-- 3. Trigger de stock : v_delta passe en numeric.
create or replace function public.fn_apply_transaction_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delta numeric(12, 3);
begin
  v_delta := case new.type
    when 'IN' then new.quantity
    when 'OUT' then -new.quantity
    when 'ADJUSTMENT' then new.quantity
  end;

  update public.products
  set stock = stock + v_delta
  where id = new.product_id;

  update public.product_stocks
  set stock = stock + v_delta
  where product_id = new.product_id and warehouse_id = new.warehouse_id;

  if not found then
    insert into public.product_stocks (product_id, warehouse_id, stock)
    values (new.product_id, new.warehouse_id, v_delta);
  end if;

  return new;
end;
$$;

-- 4. Fonctions métier : seuls les ::integer -> ::numeric et les locals "integer"
--    déclarés changent, logique inchangée (texte repris des définitions live via
--    pg_get_functiondef pour éviter toute divergence avec l'état actuel en production).

create or replace function public.create_order(payload jsonb)
returns orders
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_role text := public.current_role_name();
  v_caller_company uuid := public.current_company_id();
  v_warehouse_id uuid := (payload ->> 'warehouse_id')::uuid;
  v_client_id uuid := (payload ->> 'client_id')::uuid;
  v_order public.orders;
  v_item jsonb;
  v_product public.products;
begin
  if v_role is null or v_role <> 'sales_operator' then
    raise exception 'Rôle % non autorisé à créer une commande', coalesce(v_role, '(aucun)');
  end if;

  if v_caller_company is null then
    raise exception 'Aucune société associée à cet utilisateur';
  end if;

  if not exists (
    select 1 from public.warehouses w where w.id = v_warehouse_id and w.company_id = v_caller_company
  ) then
    raise exception 'Magasin introuvable pour cette société';
  end if;

  if not exists (
    select 1 from public.clients c where c.id = v_client_id and c.company_id = v_caller_company
  ) then
    raise exception 'Client introuvable pour cette société';
  end if;

  insert into public.orders (company_id, user_id, status, client_id, warehouse_id)
  values (v_caller_company, auth.uid(), 'pending', v_client_id, v_warehouse_id)
  returning * into v_order;

  for v_item in select * from jsonb_array_elements(payload -> 'items')
  loop
    select * into v_product from public.products where id = (v_item ->> 'product_id')::uuid;

    if v_product is null or v_product.company_id <> v_caller_company then
      raise exception 'Produit % introuvable pour cette société', v_item ->> 'product_id';
    end if;

    insert into public.order_items (order_id, product_id, quantity, unit_price)
    values (v_order.id, v_product.id, (v_item ->> 'quantity')::numeric, v_product.price);
  end loop;

  return v_order;
end;
$$;

create or replace function public.create_purchase(payload jsonb)
returns purchases
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_role text := public.current_role_name();
  v_caller_company uuid := public.current_company_id();
  v_supplier_id uuid := (payload ->> 'supplier_id')::uuid;
  v_warehouse_id uuid := (payload ->> 'warehouse_id')::uuid;
  v_purchase public.purchases;
  v_item jsonb;
  v_product public.products;
begin
  if v_role is null or v_role <> 'purchasing' then
    raise exception 'Rôle % non autorisé à créer un achat', coalesce(v_role, '(aucun)');
  end if;

  if v_caller_company is null then
    raise exception 'Aucune société associée à cet utilisateur';
  end if;

  if not exists (
    select 1 from public.suppliers s where s.id = v_supplier_id and s.company_id = v_caller_company
  ) then
    raise exception 'Fournisseur introuvable pour cette société';
  end if;

  if not exists (
    select 1 from public.warehouses w where w.id = v_warehouse_id and w.company_id = v_caller_company
  ) then
    raise exception 'Magasin introuvable pour cette société';
  end if;

  insert into public.purchases (company_id, supplier_id, warehouse_id, user_id, status)
  values (v_caller_company, v_supplier_id, v_warehouse_id, auth.uid(), 'pending')
  returning * into v_purchase;

  for v_item in select * from jsonb_array_elements(payload -> 'items')
  loop
    select * into v_product from public.products where id = (v_item ->> 'product_id')::uuid;

    if v_product is null or v_product.company_id <> v_caller_company then
      raise exception 'Produit % introuvable pour cette société', v_item ->> 'product_id';
    end if;

    insert into public.purchase_items (purchase_id, product_id, quantity, unit_cost)
    values (
      v_purchase.id,
      v_product.id,
      (v_item ->> 'quantity')::numeric,
      coalesce((v_item ->> 'unit_cost')::numeric, v_product.price)
    );
  end loop;

  return v_purchase;
end;
$$;

create or replace function public.create_production(payload jsonb)
returns productions
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_role text := public.current_role_name();
  v_caller_company uuid := public.current_company_id();
  v_warehouse_id uuid := (payload ->> 'warehouse_id')::uuid;
  v_production public.productions;
  v_item jsonb;
  v_product public.products;
  v_quantity numeric(12, 3);
  v_unit_cost numeric(12, 2);
begin
  if v_role is null or v_role <> 'production_manager' then
    raise exception 'Rôle % non autorisé à créer une production', coalesce(v_role, '(aucun)');
  end if;

  if v_caller_company is null then
    raise exception 'Aucune société associée à cet utilisateur';
  end if;

  if not exists (
    select 1 from public.warehouses w where w.id = v_warehouse_id and w.company_id = v_caller_company
  ) then
    raise exception 'Magasin introuvable pour cette société';
  end if;

  if jsonb_array_length(coalesce(payload -> 'items', '[]'::jsonb)) = 0 then
    raise exception 'Une production doit comporter au moins une ligne';
  end if;

  insert into public.productions (company_id, warehouse_id, user_id)
  values (v_caller_company, v_warehouse_id, auth.uid())
  returning * into v_production;

  for v_item in select * from jsonb_array_elements(payload -> 'items')
  loop
    select * into v_product from public.products where id = (v_item ->> 'product_id')::uuid;

    if v_product is null or v_product.company_id <> v_caller_company then
      raise exception 'Produit % introuvable pour cette société', v_item ->> 'product_id';
    end if;

    v_quantity := (v_item ->> 'quantity')::numeric;
    v_unit_cost := coalesce((v_item ->> 'unit_cost')::numeric, v_product.price);

    insert into public.production_items (production_id, product_id, quantity, unit_cost)
    values (v_production.id, v_product.id, v_quantity, v_unit_cost);

    insert into public.transactions (product_id, type, quantity, user_id, warehouse_id, production_id)
    values (v_product.id, 'IN', v_quantity, auth.uid(), v_warehouse_id, v_production.id);
  end loop;

  return v_production;
end;
$$;

create or replace function public.create_transformation(payload jsonb)
returns transformations
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_role text := public.current_role_name();
  v_caller_company uuid := public.current_company_id();
  v_warehouse_id uuid := (payload ->> 'warehouse_id')::uuid;
  v_transformation public.transformations;
  v_item jsonb;
  v_product public.products;
  v_quantity numeric(12, 3);
  v_unit_cost numeric(12, 2);
  v_input_ids uuid[] := '{}';
  v_output_ids uuid[] := '{}';
begin
  if v_role is null or v_role <> 'production_manager' then
    raise exception 'Rôle % non autorisé à créer une transformation', coalesce(v_role, '(aucun)');
  end if;

  if v_caller_company is null then
    raise exception 'Aucune société associée à cet utilisateur';
  end if;

  if not exists (
    select 1 from public.warehouses w where w.id = v_warehouse_id and w.company_id = v_caller_company
  ) then
    raise exception 'Magasin introuvable pour cette société';
  end if;

  if jsonb_array_length(coalesce(payload -> 'inputs', '[]'::jsonb)) = 0 then
    raise exception 'Une transformation doit comporter au moins un intrant';
  end if;

  if jsonb_array_length(coalesce(payload -> 'outputs', '[]'::jsonb)) = 0 then
    raise exception 'Une transformation doit comporter au moins un extrant';
  end if;

  select array_agg((elem ->> 'product_id')::uuid) into v_input_ids
  from jsonb_array_elements(payload -> 'inputs') as elem;

  select array_agg((elem ->> 'product_id')::uuid) into v_output_ids
  from jsonb_array_elements(payload -> 'outputs') as elem;

  if v_input_ids && v_output_ids then
    raise exception 'Un même produit ne peut pas être à la fois intrant et extrant d''une transformation';
  end if;

  insert into public.transformations (company_id, warehouse_id, user_id)
  values (v_caller_company, v_warehouse_id, auth.uid())
  returning * into v_transformation;

  for v_item in select * from jsonb_array_elements(payload -> 'inputs')
  loop
    select * into v_product from public.products where id = (v_item ->> 'product_id')::uuid;

    if v_product is null or v_product.company_id <> v_caller_company then
      raise exception 'Produit % introuvable pour cette société', v_item ->> 'product_id';
    end if;

    v_quantity := (v_item ->> 'quantity')::numeric;

    insert into public.transformation_inputs (transformation_id, product_id, quantity)
    values (v_transformation.id, v_product.id, v_quantity);

    insert into public.transactions (product_id, type, quantity, user_id, warehouse_id, transformation_id)
    values (v_product.id, 'OUT', v_quantity, auth.uid(), v_warehouse_id, v_transformation.id);
  end loop;

  for v_item in select * from jsonb_array_elements(payload -> 'outputs')
  loop
    select * into v_product from public.products where id = (v_item ->> 'product_id')::uuid;

    if v_product is null or v_product.company_id <> v_caller_company then
      raise exception 'Produit % introuvable pour cette société', v_item ->> 'product_id';
    end if;

    v_quantity := (v_item ->> 'quantity')::numeric;
    v_unit_cost := coalesce((v_item ->> 'unit_cost')::numeric, v_product.price);

    insert into public.transformation_outputs (transformation_id, product_id, quantity, unit_cost)
    values (v_transformation.id, v_product.id, v_quantity, v_unit_cost);

    insert into public.transactions (product_id, type, quantity, user_id, warehouse_id, transformation_id)
    values (v_product.id, 'IN', v_quantity, auth.uid(), v_warehouse_id, v_transformation.id);
  end loop;

  return v_transformation;
end;
$$;

create or replace function public.receive_purchase(purchase_id uuid, losses jsonb default '[]'::jsonb)
returns purchases
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_role text := public.current_role_name();
  v_caller_company uuid := public.current_company_id();
  v_purchase public.purchases;
  v_item record;
  v_loss jsonb;
  v_quantity_lost numeric(12, 3);
  v_quantity_received numeric(12, 3);
  v_total numeric(14, 2) := 0;
  v_vat_rate numeric(5, 2);
  v_vat numeric(14, 2);
  v_account_601 uuid;
  v_account_401 uuid;
  v_account_4452 uuid;
  v_entry_id uuid;
begin
  if v_role is null or v_role <> 'warehouse_manager' then
    raise exception 'Rôle % non autorisé à réceptionner un achat', coalesce(v_role, '(aucun)');
  end if;

  select * into v_purchase from public.purchases p where p.id = receive_purchase.purchase_id;

  if v_purchase is null then
    raise exception 'Achat introuvable';
  end if;

  if v_purchase.company_id is distinct from v_caller_company then
    raise exception 'Impossible de réceptionner un achat d''une autre société';
  end if;

  if v_purchase.status <> 'pending' then
    raise exception 'Seul un achat en attente peut être réceptionné (statut actuel : %)', v_purchase.status;
  end if;

  for v_item in select * from public.purchase_items where purchase_items.purchase_id = v_purchase.id
  loop
    v_loss := (
      select l from jsonb_array_elements(coalesce(receive_purchase.losses, '[]')) l
      where (l ->> 'product_id')::uuid = v_item.product_id
      limit 1
    );

    v_quantity_lost := coalesce((v_loss ->> 'quantity_lost')::numeric, 0);
    v_quantity_received := v_item.quantity - v_quantity_lost;

    if v_quantity_received < 0 then
      raise exception 'La perte déclarée dépasse la quantité commandée pour un produit';
    end if;

    if v_quantity_received > 0 then
      insert into public.transactions (product_id, type, quantity, user_id, warehouse_id, purchase_id)
      values (v_item.product_id, 'IN', v_quantity_received, auth.uid(), v_purchase.warehouse_id, v_purchase.id);
    end if;

    if v_quantity_lost > 0 then
      if (v_loss ->> 'transporter_id') is null then
        raise exception 'Un transporteur est requis pour déclarer une perte';
      end if;

      insert into public.purchase_losses (purchase_id, transporter_id, product_id, quantity_lost, unit_cost, reason, user_id)
      values (
        v_purchase.id,
        (v_loss ->> 'transporter_id')::uuid,
        v_item.product_id,
        v_quantity_lost,
        v_item.unit_cost,
        v_loss ->> 'reason',
        auth.uid()
      );
    end if;

    v_total := v_total + (v_item.quantity * v_item.unit_cost);
  end loop;

  update public.purchases set status = 'received' where id = v_purchase.id
  returning * into v_purchase;

  if v_total > 0 then
    select vat_rate into v_vat_rate from public.companies where id = v_purchase.company_id;
    v_vat := round(v_total * v_vat_rate / 100, 2);

    select id into v_account_601 from public.chart_of_accounts where company_id = v_purchase.company_id and code = '601';
    select id into v_account_401 from public.chart_of_accounts where company_id = v_purchase.company_id and code = '401';
    select id into v_account_4452 from public.chart_of_accounts where company_id = v_purchase.company_id and code = '4452';

    if v_account_601 is null or v_account_401 is null or v_account_4452 is null then
      raise exception 'Plan comptable incomplet pour cette société (comptes 601/401/4452 requis)';
    end if;

    insert into public.journal_entries (company_id, journal_code, description, purchase_id)
    values (v_purchase.company_id, 'ACHATS', 'Réception achat #' || left(v_purchase.id::text, 8), v_purchase.id)
    returning id into v_entry_id;

    insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
    values (v_entry_id, v_account_601, v_total, 0);

    insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
    values (v_entry_id, v_account_4452, v_vat, 0);

    insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
    values (v_entry_id, v_account_401, 0, v_total + v_vat);
  end if;

  return v_purchase;
end;
$$;

-- transfer_stock change de signature (p_quantity integer -> numeric) : DROP requis,
-- Postgres distingue les fonctions par signature complète (même piège déjà rencontré en
-- Phases 12-13).
drop function if exists public.transfer_stock(uuid, uuid, uuid, integer);

create function public.transfer_stock(
  p_product_id uuid,
  p_from_warehouse_id uuid,
  p_to_warehouse_id uuid,
  p_quantity numeric
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_role text := public.current_role_name();
  v_caller_company uuid := public.current_company_id();
  v_from_warehouse public.warehouses;
  v_to_warehouse public.warehouses;
  v_transfer_id uuid := gen_random_uuid();
begin
  if v_role is null or v_role not in ('warehouse_manager', 'logistics_transport') then
    raise exception 'Rôle % non autorisé à transférer du stock', coalesce(v_role, '(aucun)');
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La quantité transférée doit être positive';
  end if;

  if p_from_warehouse_id = p_to_warehouse_id then
    raise exception 'Le magasin source et le magasin destination doivent être différents';
  end if;

  select * into v_from_warehouse from public.warehouses w where w.id = p_from_warehouse_id;
  select * into v_to_warehouse from public.warehouses w where w.id = p_to_warehouse_id;

  if v_from_warehouse is null or v_to_warehouse is null then
    raise exception 'Magasin introuvable';
  end if;

  if v_from_warehouse.company_id is distinct from v_caller_company
    or v_to_warehouse.company_id is distinct from v_caller_company
  then
    raise exception 'Impossible de transférer du stock vers/depuis un magasin d''une autre société';
  end if;

  if not exists (
    select 1 from public.products p
    where p.id = p_product_id and p.company_id = v_caller_company
  ) then
    raise exception 'Produit introuvable';
  end if;

  insert into public.transactions (product_id, type, quantity, user_id, warehouse_id, note, transfer_group_id)
  values (
    p_product_id, 'OUT', p_quantity, auth.uid(), p_from_warehouse_id,
    'Transfert vers ' || v_to_warehouse.name, v_transfer_id
  );

  insert into public.transactions (product_id, type, quantity, user_id, warehouse_id, note, transfer_group_id)
  values (
    p_product_id, 'IN', p_quantity, auth.uid(), p_to_warehouse_id,
    'Transfert depuis ' || v_from_warehouse.name, v_transfer_id
  );
end;
$$;

grant execute on function public.transfer_stock(uuid, uuid, uuid, numeric) to authenticated;

-- 5. Conversion du catalogue : céréales/légumineuses/sucre -> tonnes (Production +
--    Formation, par UUID exact). Prix reconverti : prix_tonne = round(prix_sac / facteur, 2).
update public.products set name = 'Riz local', unit = 'tonne', price = 540000.00
  where id = 'c2a1d0d1-7343-44f9-8c3b-1f2454d7a3e1';
update public.products set name = 'Sorgho', unit = 'tonne', price = 400000.00
  where id = '72be00f5-9d08-4f74-a9ae-a5e17cebd10d';
update public.products set name = 'Mil', unit = 'tonne', price = 450000.00
  where id = '49f26829-b41f-41b6-aeb2-1eebadcffe64';
update public.products set name = 'Niébé', unit = 'tonne', price = 600000.00
  where id = '1c558f3f-cbbe-4738-b07d-26b9511121a9';
update public.products set name = 'Arachide décortiquée', unit = 'tonne', price = 700000.00
  where id = 'ca45d1a1-c35a-42ee-aea3-a92287159e9d';
update public.products set name = 'Sucre - brésilien', unit = 'tonne', price = 11100.00
  where id = '8e19782e-476c-4785-b157-143cb982e12b';

update public.products set name = 'Riz local (formation)', unit = 'tonne', price = 540000.00
  where id = '21dd128f-56f3-4ef1-ae2c-a28feb513698';
update public.products set name = 'Sorgho (formation)', unit = 'tonne', price = 400000.00
  where id = 'c36ef895-dd34-4fd0-b64d-2de689a8e6ba';
update public.products set name = 'Mil (formation)', unit = 'tonne', price = 450000.00
  where id = '49546f60-a65f-44b2-9afa-946c4efe9d97';
update public.products set name = 'Niébé (formation)', unit = 'tonne', price = 600000.00
  where id = '4125dee3-3d59-4022-a077-c322a82b9774';
update public.products set name = 'Arachide décortiquée (formation)', unit = 'tonne', price = 700000.00
  where id = '34377450-ca25-42af-833a-f0855fc59689';

-- Huile existante ("bidon 20L") : format inchangé, seule l'unité est renseignée.
update public.products set unit = 'bidon'
  where id in ('5fb3c1e6-9dab-4385-a68f-f4c77601595b', '29fb69bc-20fe-43c9-a805-e3609af61280');

-- 6. Rebasage du stock courant des produits convertis vers la nouvelle unité, via une
--    transaction ADJUSTMENT par ligne product_stocks concernée (l'historique des
--    mouvements antérieurs reste affiché dans l'ancienne unité, limite documentée dans
--    le README, cohérente avec l'immutabilité déjà en place ailleurs dans l'app).
do $$
declare
  v_conv record;
  v_ps record;
  v_new_stock numeric(12, 3);
  v_delta numeric(12, 3);
begin
  for v_conv in
    select * from (values
      ('c2a1d0d1-7343-44f9-8c3b-1f2454d7a3e1'::uuid, 0.05::numeric, 'da2de12d-6761-418a-8e01-055f21933d5e'::uuid),
      ('72be00f5-9d08-4f74-a9ae-a5e17cebd10d'::uuid, 0.1::numeric, 'da2de12d-6761-418a-8e01-055f21933d5e'::uuid),
      ('49f26829-b41f-41b6-aeb2-1eebadcffe64'::uuid, 0.1::numeric, 'da2de12d-6761-418a-8e01-055f21933d5e'::uuid),
      ('1c558f3f-cbbe-4738-b07d-26b9511121a9'::uuid, 0.1::numeric, 'da2de12d-6761-418a-8e01-055f21933d5e'::uuid),
      ('ca45d1a1-c35a-42ee-aea3-a92287159e9d'::uuid, 0.05::numeric, 'da2de12d-6761-418a-8e01-055f21933d5e'::uuid),
      ('8e19782e-476c-4785-b157-143cb982e12b'::uuid, 0.05::numeric, 'da2de12d-6761-418a-8e01-055f21933d5e'::uuid),
      ('21dd128f-56f3-4ef1-ae2c-a28feb513698'::uuid, 0.05::numeric, '8f7909b5-b217-40d6-9d92-c072e06d443a'::uuid),
      ('c36ef895-dd34-4fd0-b64d-2de689a8e6ba'::uuid, 0.1::numeric, '8f7909b5-b217-40d6-9d92-c072e06d443a'::uuid),
      ('49546f60-a65f-44b2-9afa-946c4efe9d97'::uuid, 0.1::numeric, '8f7909b5-b217-40d6-9d92-c072e06d443a'::uuid),
      ('4125dee3-3d59-4022-a077-c322a82b9774'::uuid, 0.1::numeric, '8f7909b5-b217-40d6-9d92-c072e06d443a'::uuid),
      ('34377450-ca25-42af-833a-f0855fc59689'::uuid, 0.05::numeric, '8f7909b5-b217-40d6-9d92-c072e06d443a'::uuid)
    ) as t(product_id, factor, user_id)
  loop
    for v_ps in
      select ps.warehouse_id, ps.stock
      from public.product_stocks ps
      where ps.product_id = v_conv.product_id and ps.stock <> 0
    loop
      v_new_stock := round(v_ps.stock * v_conv.factor, 3);
      v_delta := v_new_stock - v_ps.stock;

      insert into public.transactions (product_id, type, quantity, user_id, warehouse_id)
      values (v_conv.product_id, 'ADJUSTMENT', v_delta, v_conv.user_id, v_ps.warehouse_id);
    end loop;
  end loop;
end;
$$;

-- 7. Restructuration du catalogue huile : 4 nouveaux produits par société, un par format
--    réel de conditionnement (stock=0, prix=0 -- à saisir manuellement après coup).
insert into public.products (company_id, name, price, stock, unit) values
  ('00000000-0000-0000-0000-000000000001', 'Huile d''arachide — carton (20 x 1L)', 0, 0, 'carton'),
  ('00000000-0000-0000-0000-000000000001', 'Huile d''arachide — carton (4 x 5L)', 0, 0, 'carton'),
  ('00000000-0000-0000-0000-000000000001', 'Huile d''arachide — bidon 10L', 0, 0, 'bidon'),
  ('00000000-0000-0000-0000-000000000001', 'Huile d''arachide — bidon 25L', 0, 0, 'bidon'),
  ('00000000-0000-0000-0000-0000000000f0', 'Huile d''arachide — carton (20 x 1L) (formation)', 0, 0, 'carton'),
  ('00000000-0000-0000-0000-0000000000f0', 'Huile d''arachide — carton (4 x 5L) (formation)', 0, 0, 'carton'),
  ('00000000-0000-0000-0000-0000000000f0', 'Huile d''arachide — bidon 10L (formation)', 0, 0, 'bidon'),
  ('00000000-0000-0000-0000-0000000000f0', 'Huile d''arachide — bidon 25L (formation)', 0, 0, 'bidon');
