-- Le prix de revient (coût de stock) était jusqu'ici calculé par achat, par réception
-- (receive_purchase, prorata VALEUR des frais de transport/manutention, cf.
-- 0068_prix_de_revient_prorata_valeur.sql) : un même produit pouvait porter plusieurs
-- coûts selon l'historique des achats. Demande client : figer ce coût une seule fois,
-- à la création du produit, à partir de trois montants saisis dans le module produit
-- (prix global d'achat, frais de transport, frais de manutention), divisés par le stock
-- initial. Ceci remplace le calcul par achat -- confirmé avec l'utilisateur, qui a aussi
-- confirmé vouloir réellement repurposer le champ "price" existant (qui devient le coût
-- d'achat) plutôt que d'ajouter un champ de coût à côté, avec un nouveau champ séparé
-- "selling_price" reprenant le rôle de prix de vente que jouait l'ancien "price".
--
-- Les frais purchases.freight_cost/handling_cost et purchase_items.unit_cost saisis à
-- chaque achat restent en place : ils continuent de générer les écritures comptables
-- réelles (601/608) sur la base du montant effectivement facturé -- ces écritures ne
-- dépendaient déjà pas du calcul du prix de revient (elles utilisent les montants
-- bruts), donc rien à changer côté comptabilité. Seule la source du coût stocké sur
-- transactions.unit_cost / stock_lots.unit_cost change : plus un recalcul par ligne,
-- mais une lecture directe du coût fixe du produit.

alter table public.products rename column price to purchase_cost;
comment on column public.products.purchase_cost is 'Prix global d''achat (cout total d''acquisition), saisi a la creation du produit.';

alter table public.products add column selling_price numeric(12, 2) not null default 0 check (selling_price >= 0);
alter table public.products add column freight_cost numeric(12, 2) not null default 0 check (freight_cost >= 0);
alter table public.products add column handling_cost numeric(12, 2) not null default 0 check (handling_cost >= 0);
alter table public.products add column unit_cost numeric(12, 2) not null default 0 check (unit_cost >= 0);
comment on column public.products.selling_price is 'Prix de vente, utilise par create_order() -- role auparavant tenu par products.price.';
comment on column public.products.unit_cost is 'Prix de revient unitaire, fige a la creation : (purchase_cost + freight_cost + handling_cost) / stock initial. Jamais recalcule ensuite.';

-- Backfill : les produits existants n'ont pas de prix de vente ni de frais distincts --
-- le seul montant connu (l'ancien "price") devient à la fois le prix de vente (pour ne
-- rien changer côté facturation) et une estimation initiale du prix de revient.
update public.products set selling_price = purchase_cost, unit_cost = purchase_cost;

-- Le coût doit rester figé après création, même si le stock ou le coût d'achat sont
-- modifiés plus tard par un autre chemin -- donc BEFORE INSERT uniquement, jamais UPDATE.
create function public.fn_compute_product_unit_cost()
returns trigger
language plpgsql
as $$
begin
  if new.stock > 0 then
    new.unit_cost := round((new.purchase_cost + new.freight_cost + new.handling_cost) / new.stock, 2);
  else
    new.unit_cost := 0;
  end if;
  return new;
end;
$$;

create trigger trg_compute_product_unit_cost
  before insert on public.products
  for each row execute function public.fn_compute_product_unit_cost();

-- create_order() : v_product.price -> v_product.selling_price (seul changement côté vente).
create or replace function public.create_order(payload jsonb)
returns orders
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_caller_company uuid := public.current_company_id();
  v_warehouse_id uuid := (payload ->> 'warehouse_id')::uuid;
  v_client_id uuid := (payload ->> 'client_id')::uuid;
  v_order public.orders;
  v_item jsonb;
  v_product public.products;
begin
  if not public.has_attribution('ventes.creer_commande') then
    raise exception 'Non autorisé à créer une commande';
  end if;

  if v_caller_company is null then
    raise exception 'Aucune société associée à cet utilisateur';
  end if;

  if not exists (
    select 1 from public.warehouses w
    where w.id = v_warehouse_id and w.company_id = v_caller_company and w.active = true
  ) then
    raise exception 'Magasin introuvable ou archivé pour cette société';
  end if;

  if not exists (
    select 1 from public.clients c
    where c.id = v_client_id and c.company_id = v_caller_company and c.active = true
  ) then
    raise exception 'Client introuvable ou archivé pour cette société';
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

    if v_product.active is not true then
      raise exception 'Produit % archivé, indisponible pour une nouvelle commande', v_product.name;
    end if;

    insert into public.order_items (order_id, product_id, quantity, unit_price)
    values (v_order.id, v_product.id, (v_item ->> 'quantity')::numeric, v_product.selling_price);
  end loop;

  return v_order;
end;
$function$;

-- create_purchase() : le fallback (ligne sans unit_cost explicite) utilisait par erreur
-- le prix de vente -- corrigé pour utiliser le vrai coût d'achat du produit.
create or replace function public.create_purchase(payload jsonb)
returns purchases
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_caller_company uuid := public.current_company_id();
  v_supplier_id uuid := (payload ->> 'supplier_id')::uuid;
  v_warehouse_id uuid := (payload ->> 'warehouse_id')::uuid;
  v_purchase public.purchases;
  v_item jsonb;
  v_product public.products;
begin
  if not public.has_attribution('achats.creer') then
    raise exception 'Non autorisé à créer un achat';
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

  insert into public.purchases (company_id, supplier_id, warehouse_id, user_id, status, freight_cost, handling_cost)
  values (
    v_caller_company, v_supplier_id, v_warehouse_id, auth.uid(), 'pending',
    coalesce((payload ->> 'freight_cost')::numeric, 0),
    coalesce((payload ->> 'handling_cost')::numeric, 0)
  )
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
      coalesce((v_item ->> 'unit_cost')::numeric, v_product.purchase_cost)
    );
  end loop;

  return v_purchase;
end;
$$;

-- create_production() : même correction de fallback que create_purchase.
create or replace function public.create_production(payload jsonb)
returns productions
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_caller_company uuid := public.current_company_id();
  v_warehouse_id uuid := (payload ->> 'warehouse_id')::uuid;
  v_production public.productions;
  v_item jsonb;
  v_product public.products;
  v_quantity numeric(12, 3);
  v_unit_cost numeric(12, 2);
  v_total_value numeric(14, 2) := 0;
  v_account_36 uuid;
  v_account_73 uuid;
  v_entry_id uuid;
begin
  if not public.has_attribution('production.creer') then
    raise exception 'Non autorisé à créer une production';
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
    v_unit_cost := coalesce((v_item ->> 'unit_cost')::numeric, v_product.purchase_cost);

    insert into public.production_items (production_id, product_id, quantity, unit_cost)
    values (v_production.id, v_product.id, v_quantity, v_unit_cost);

    insert into public.transactions (product_id, type, quantity, user_id, warehouse_id, production_id, expiry_date)
    values (v_product.id, 'IN', v_quantity, auth.uid(), v_warehouse_id, v_production.id, (v_item ->> 'expiry_date')::date);

    v_total_value := v_total_value + (v_quantity * v_unit_cost);
  end loop;

  if v_total_value > 0 then
    select id into v_account_36 from public.chart_of_accounts where company_id = v_caller_company and code = '36';
    select id into v_account_73 from public.chart_of_accounts where company_id = v_caller_company and code = '73';

    if v_account_36 is null or v_account_73 is null then
      raise exception 'Plan comptable incomplet pour cette société (comptes 36/73 requis)';
    end if;

    insert into public.journal_entries (company_id, journal_code, description, production_id)
    values (v_caller_company, 'PRODUCTION', 'Production #' || left(v_production.id::text, 8), v_production.id)
    returning id into v_entry_id;

    insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
    values (v_entry_id, v_account_36, v_total_value, 0);

    insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
    values (v_entry_id, v_account_73, 0, v_total_value);
  end if;

  return v_production;
end;
$function$;

-- create_transformation() : deux usages distincts de p.price à séparer -- le poids de
-- prorata entre extrants reste une valeur de marché (selling_price) ; le fallback de
-- coût unitaire devient un vrai coût (purchase_cost).
create or replace function public.create_transformation(payload jsonb)
returns transformations
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_caller_company uuid := public.current_company_id();
  v_warehouse_id uuid := (payload ->> 'warehouse_id')::uuid;
  v_transformation public.transformations;
  v_item jsonb;
  v_product public.products;
  v_quantity numeric(12, 3);
  v_unit_cost numeric(12, 2);
  v_input_ids uuid[] := '{}';
  v_output_ids uuid[] := '{}';
  v_out_transaction_id uuid;
  v_consumed_cost numeric(14, 2);
  v_total_intrant_cost numeric(14, 2) := 0;
  v_total_output_value numeric(14, 2) := 0;
  v_account_31 uuid;
  v_account_36 uuid;
  v_account_601 uuid;
  v_entry_id uuid;
begin
  if not public.has_attribution('transformation.creer') then
    raise exception 'Non autorisé à créer une transformation';
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
    values (v_product.id, 'OUT', v_quantity, auth.uid(), v_warehouse_id, v_transformation.id)
    returning id into v_out_transaction_id;

    select coalesce(sum(tla.quantity * sl.unit_cost), 0) into v_consumed_cost
    from public.transaction_lot_allocations tla
    join public.stock_lots sl on sl.id = tla.lot_id
    where tla.transaction_id = v_out_transaction_id;

    v_total_intrant_cost := v_total_intrant_cost + v_consumed_cost;
  end loop;

  select coalesce(sum((elem ->> 'quantity')::numeric * coalesce(p.selling_price, 0)), 0) into v_total_output_value
  from jsonb_array_elements(payload -> 'outputs') as elem
  join public.products p on p.id = (elem ->> 'product_id')::uuid;

  for v_item in select * from jsonb_array_elements(payload -> 'outputs')
  loop
    select * into v_product from public.products where id = (v_item ->> 'product_id')::uuid;

    if v_product is null or v_product.company_id <> v_caller_company then
      raise exception 'Produit % introuvable pour cette société', v_item ->> 'product_id';
    end if;

    v_quantity := (v_item ->> 'quantity')::numeric;

    if v_total_output_value > 0 then
      v_unit_cost := v_total_intrant_cost * coalesce(v_product.selling_price, 0) / v_total_output_value;
    else
      v_unit_cost := v_product.purchase_cost;
    end if;

    insert into public.transformation_outputs (transformation_id, product_id, quantity, unit_cost)
    values (v_transformation.id, v_product.id, v_quantity, v_unit_cost);

    insert into public.transactions (product_id, type, quantity, user_id, warehouse_id, transformation_id, expiry_date)
    values (v_product.id, 'IN', v_quantity, auth.uid(), v_warehouse_id, v_transformation.id, (v_item ->> 'expiry_date')::date);
  end loop;

  if v_total_intrant_cost > 0 then
    select id into v_account_31 from public.chart_of_accounts where company_id = v_caller_company and code = '31';
    select id into v_account_36 from public.chart_of_accounts where company_id = v_caller_company and code = '36';
    select id into v_account_601 from public.chart_of_accounts where company_id = v_caller_company and code = '601';

    if v_account_31 is null or v_account_36 is null or v_account_601 is null then
      raise exception 'Plan comptable incomplet pour cette société (comptes 31/36/601 requis)';
    end if;

    insert into public.journal_entries (company_id, journal_code, description, transformation_id)
    values (v_caller_company, 'TRANSFORMATION', 'Transformation #' || left(v_transformation.id::text, 8), v_transformation.id)
    returning id into v_entry_id;

    insert into public.journal_entry_lines (entry_id, account_id, debit, credit) values
      (v_entry_id, v_account_31, v_total_intrant_cost, 0),
      (v_entry_id, v_account_601, 0, v_total_intrant_cost),
      (v_entry_id, v_account_36, v_total_intrant_cost, 0),
      (v_entry_id, v_account_31, 0, v_total_intrant_cost);
  end if;

  return v_transformation;
end;
$$;

-- receive_purchase() : retire le prorata par valeur -- le coût du lot reçu vient
-- désormais directement du prix de revient fixe du produit. Les écritures comptables
-- (601 sur la valeur brute, 608 sur les frais bruts) sont inchangées.
create or replace function public.receive_purchase(
  purchase_id uuid,
  losses jsonb default '[]'::jsonb,
  lot_expiry_dates jsonb default '[]'::jsonb,
  p_driver_name text default null,
  p_truck_plate text default null,
  p_driver_phone text default null,
  p_repackage_count integer default null,
  p_observation text default null
)
returns purchases
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_caller_company uuid := public.current_company_id();
  v_purchase public.purchases;
  v_item record;
  v_product public.products;
  v_loss jsonb;
  v_quantity_lost numeric(12, 3);
  v_quantity_received numeric(12, 3);
  v_expiry_date date;
  v_total numeric(14, 2) := 0;
  v_taxable_total numeric(14, 2) := 0;
  v_vat_rate numeric(5, 2);
  v_vat numeric(14, 2);
  v_account_601 uuid;
  v_account_401 uuid;
  v_account_4452 uuid;
  v_account_608 uuid;
  v_account_521 uuid;
  v_entry_id uuid;
  v_ancillary_total numeric(12, 2);
begin
  if not public.has_attribution('achats.receptionner') then
    raise exception 'Non autorisé à réceptionner un achat';
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

  v_ancillary_total := coalesce(v_purchase.freight_cost, 0) + coalesce(v_purchase.handling_cost, 0);

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

    v_expiry_date := (
      select (e ->> 'expiry_date')::date
      from jsonb_array_elements(coalesce(receive_purchase.lot_expiry_dates, '[]')) e
      where (e ->> 'product_id')::uuid = v_item.product_id
      limit 1
    );

    select * into v_product from public.products where id = v_item.product_id;

    if v_quantity_received > 0 then
      insert into public.transactions (product_id, type, quantity, user_id, warehouse_id, purchase_id, expiry_date, unit_cost)
      values (v_item.product_id, 'IN', v_quantity_received, auth.uid(), v_purchase.warehouse_id, v_purchase.id, v_expiry_date, v_product.unit_cost);
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
    if v_product.vat_exempt is not true then
      v_taxable_total := v_taxable_total + (v_item.quantity * v_item.unit_cost);
    end if;
  end loop;

  update public.purchases
  set status = 'received',
      received_at = now(),
      driver_name = p_driver_name,
      truck_plate = p_truck_plate,
      driver_phone = p_driver_phone,
      repackage_count = p_repackage_count,
      observation = p_observation
  where id = v_purchase.id
  returning * into v_purchase;

  if v_total > 0 then
    select vat_rate into v_vat_rate from public.companies where id = v_purchase.company_id;
    v_vat := round(v_taxable_total * v_vat_rate / 100, 2);

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

  if v_ancillary_total > 0 then
    select id into v_account_608 from public.chart_of_accounts where company_id = v_purchase.company_id and code = '608';
    select id into v_account_521 from public.chart_of_accounts where company_id = v_purchase.company_id and code = '521';

    if v_account_608 is null or v_account_521 is null then
      raise exception 'Plan comptable incomplet pour cette société (comptes 608/521 requis)';
    end if;

    insert into public.journal_entries (company_id, journal_code, description, purchase_id)
    values (v_purchase.company_id, 'FRAIS', 'Frais accessoires réception #' || left(v_purchase.id::text, 8), v_purchase.id)
    returning id into v_entry_id;

    insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
    values (v_entry_id, v_account_608, v_ancillary_total, 0);

    insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
    values (v_entry_id, v_account_521, 0, v_ancillary_total);
  end if;

  return v_purchase;
end;
$$;

-- update_product_price() : édite désormais le prix de vente, pas le coût d'achat --
-- product_price_history devient l'historique du prix de vente.
create or replace function public.update_product_price(
  product_id uuid,
  new_price numeric,
  reason text default null
)
returns public.products
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_caller_company uuid := public.current_company_id();
  v_product public.products;
begin
  if not public.has_attribution('produits.modifier_prix') then
    raise exception 'Non autorisé à modifier le prix d''un produit';
  end if;

  select * into v_product from public.products p where p.id = update_product_price.product_id;

  if v_product is null or v_product.company_id <> v_caller_company then
    raise exception 'Produit introuvable pour cette société';
  end if;

  if new_price is null or new_price < 0 then
    raise exception 'Le nouveau prix doit être positif';
  end if;

  if new_price <> v_product.selling_price then
    insert into public.product_price_history (product_id, old_price, new_price, reason, user_id)
    values (v_product.id, v_product.selling_price, new_price, update_product_price.reason, auth.uid());

    update public.products set selling_price = new_price where id = v_product.id
    returning * into v_product;
  end if;

  return v_product;
end;
$$;
