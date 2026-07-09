-- Harmonisation avec le cahier des charges officiel (gouvernance, séparation des
-- tâches, traçabilité). Éclate les 6 rôles de la Phase 8 en 9 profils métier, rend
-- l'administrateur strictement lecture seule (sauf gestion des comptes), déplace la
-- sortie de stock + l'écriture comptable des ventes de la création de commande vers sa
-- validation (workflow commande → validation → sortie stock → facturation, avec un rôle
-- différent à chaque étape), et ajoute une traçabilité de consultation.

-- ============================================================================
-- Rôles : renommage en place (role_id référencé par users.role_id, les comptes
-- existants héritent automatiquement du bon nouveau rôle) + 3 nouvelles lignes.
-- ============================================================================

update public.roles set name = 'warehouse_manager' where name = 'logistics';
update public.roles set name = 'sales_operator' where name = 'sales';

insert into public.roles (name) values
  ('supervisor'),
  ('purchasing'),
  ('logistics_transport')
on conflict (name) do nothing;

-- Corrige handle_new_user() qui référence encore l'ancien slug 'sales' (bug identique à
-- celui rencontré en Phase 8 avec 'seller' — évité cette fois en le corrigeant dans la
-- même migration que le renommage, pas après coup).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_default_role_id smallint;
begin
  select id into v_default_role_id from public.roles where name = 'sales_operator';

  insert into public.users (id, email, role_id)
  values (new.id, new.email, v_default_role_id);

  return new;
end;
$$;

-- ============================================================================
-- orders.warehouse_id : jusqu'ici seulement transmis au payload de create_order et
-- tamponné sur chaque transaction, jamais persisté sur la commande elle-même. Devient
-- nécessaire car la sortie de stock n'a plus lieu à la création mais à la validation
-- (validate_order doit retrouver le magasin). Backfill depuis les transactions OUT déjà
-- générées par les commandes existantes ; repli sur le premier magasin de la société
-- pour les rares commandes sans lignes/transactions.
-- ============================================================================

alter table public.orders add column warehouse_id uuid references public.warehouses (id);

update public.orders o
set warehouse_id = (
  select t.warehouse_id from public.transactions t where t.order_id = o.id limit 1
)
where o.warehouse_id is null;

update public.orders o
set warehouse_id = (
  select w.id from public.warehouses w where w.company_id = o.company_id order by w.created_at limit 1
)
where o.warehouse_id is null;

alter table public.orders alter column warehouse_id set not null;

create index orders_warehouse_id_idx on public.orders (warehouse_id);

-- ============================================================================
-- RLS : écriture réservée au rôle spécialiste précis, plus aucun bypass admin.
-- Suppression (delete) retirée partout : admin passe en lecture seule et aucun des 9
-- rôles ne s'est vu attribuer ce pouvoir par le cahier — aucune UI de suppression
-- n'existait déjà côté frontend.
-- ============================================================================

drop policy products_insert on public.products;
create policy products_insert on public.products
  for insert to authenticated
  with check (
    public.current_role_name() in ('warehouse_manager', 'production_manager')
    and company_id = public.current_company_id()
  );

drop policy products_update on public.products;
create policy products_update on public.products
  for update to authenticated
  using (
    public.current_role_name() in ('warehouse_manager', 'production_manager')
    and company_id = public.current_company_id()
  )
  with check (
    public.current_role_name() in ('warehouse_manager', 'production_manager')
    and company_id = public.current_company_id()
  );

drop policy products_delete on public.products;

drop policy warehouses_insert on public.warehouses;
create policy warehouses_insert on public.warehouses
  for insert to authenticated
  with check (
    public.current_role_name() = 'warehouse_manager'
    and company_id = public.current_company_id()
  );

drop policy warehouses_update on public.warehouses;
create policy warehouses_update on public.warehouses
  for update to authenticated
  using (
    public.current_role_name() = 'warehouse_manager'
    and company_id = public.current_company_id()
  )
  with check (
    public.current_role_name() = 'warehouse_manager'
    and company_id = public.current_company_id()
  );

drop policy warehouses_delete on public.warehouses;

drop policy suppliers_insert on public.suppliers;
create policy suppliers_insert on public.suppliers
  for insert to authenticated
  with check (
    public.current_role_name() = 'purchasing'
    and company_id = public.current_company_id()
  );

drop policy suppliers_update on public.suppliers;
create policy suppliers_update on public.suppliers
  for update to authenticated
  using (
    public.current_role_name() = 'purchasing'
    and company_id = public.current_company_id()
  )
  with check (
    public.current_role_name() = 'purchasing'
    and company_id = public.current_company_id()
  );

drop policy suppliers_delete on public.suppliers;

drop policy clients_insert on public.clients;
create policy clients_insert on public.clients
  for insert to authenticated
  with check (
    public.current_role_name() = 'sales_operator'
    and company_id = public.current_company_id()
  );

drop policy clients_update on public.clients;
create policy clients_update on public.clients
  for update to authenticated
  using (
    public.current_role_name() = 'sales_operator'
    and company_id = public.current_company_id()
  )
  with check (
    public.current_role_name() = 'sales_operator'
    and company_id = public.current_company_id()
  );

drop policy clients_delete on public.clients;

drop policy chart_of_accounts_insert on public.chart_of_accounts;
create policy chart_of_accounts_insert on public.chart_of_accounts
  for insert to authenticated
  with check (
    public.current_role_name() = 'accounting'
    and company_id = public.current_company_id()
  );

drop policy chart_of_accounts_update on public.chart_of_accounts;
create policy chart_of_accounts_update on public.chart_of_accounts
  for update to authenticated
  using (
    public.current_role_name() = 'accounting'
    and company_id = public.current_company_id()
  )
  with check (
    public.current_role_name() = 'accounting'
    and company_id = public.current_company_id()
  );

drop policy chart_of_accounts_delete on public.chart_of_accounts;

-- journal_entries / journal_entry_lines : lecture admin (toutes sociétés) +
-- comptable/contrôleur (leur société). Remplace le "manager" de la Phase 8.
drop policy journal_entries_select on public.journal_entries;
create policy journal_entries_select on public.journal_entries
  for select to authenticated
  using (
    public.current_role_name() = 'admin'
    or (
      public.current_role_name() in ('accounting', 'controller')
      and company_id = public.current_company_id()
    )
  );

drop policy journal_entry_lines_select on public.journal_entry_lines;
create policy journal_entry_lines_select on public.journal_entry_lines
  for select to authenticated
  using (
    exists (
      select 1
      from public.journal_entries e
      where e.id = journal_entry_lines.entry_id
        and (
          public.current_role_name() = 'admin'
          or (
            public.current_role_name() in ('accounting', 'controller')
            and e.company_id = public.current_company_id()
          )
        )
    )
  );

-- transactions : mouvement de stock manuel réservé aux rôles qui manipulent
-- physiquement le stock (Gestionnaire de magasin, Logistique/Transport).
drop policy transactions_insert on public.transactions;
create policy transactions_insert on public.transactions
  for insert to authenticated
  with check (
    public.current_role_name() in ('warehouse_manager', 'logistics_transport')
    and exists (
      select 1
      from public.products p
      where p.id = transactions.product_id and p.company_id = public.current_company_id()
    )
  );

-- ============================================================================
-- RPC : rôles resserrés au seul spécialiste habilité (plus de bypass admin — un
-- administrateur ne déclenche plus aucune opération métier). Restructuration du cycle
-- de vente : create_order ne touche plus au stock ni à la comptabilité (déplacé dans
-- validate_order) ; cancel_order simplifié (plus aucune transaction à restaurer
-- puisqu'aucune n'a été appliquée avant validation).
-- ============================================================================

create or replace function public.create_order(payload jsonb)
returns public.orders
language plpgsql
security definer
set search_path = public
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
    values (v_order.id, v_product.id, (v_item ->> 'quantity')::integer, v_product.price);
  end loop;

  return v_order;
end;
$$;

-- Validation (Superviseur) : c'est ICI, et seulement ici, que le stock sort et que
-- l'écriture comptable VENTES est générée — logique reprise telle quelle de l'ancienne
-- create_order (0012), juste déplacée.
create or replace function public.validate_order(order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.current_role_name();
  v_caller_company uuid := public.current_company_id();
  v_order public.orders;
  v_item record;
  v_total numeric(14, 2) := 0;
  v_vat_rate numeric(5, 2);
  v_vat numeric(14, 2);
  v_account_411 uuid;
  v_account_701 uuid;
  v_account_4431 uuid;
  v_entry_id uuid;
begin
  if v_role is null or v_role <> 'supervisor' then
    raise exception 'Rôle % non autorisé à valider une commande', coalesce(v_role, '(aucun)');
  end if;

  select * into v_order from public.orders o where o.id = validate_order.order_id;

  if v_order is null then
    raise exception 'Commande introuvable';
  end if;

  if v_order.company_id is distinct from v_caller_company then
    raise exception 'Impossible de valider une commande d''une autre société';
  end if;

  if v_order.status <> 'pending' then
    raise exception 'Seule une commande en attente peut être validée (statut actuel : %)', v_order.status;
  end if;

  for v_item in select * from public.order_items where order_items.order_id = v_order.id
  loop
    insert into public.transactions (product_id, type, quantity, user_id, warehouse_id, order_id)
    values (v_item.product_id, 'OUT', v_item.quantity, auth.uid(), v_order.warehouse_id, v_order.id);

    v_total := v_total + (v_item.quantity * v_item.unit_price);
  end loop;

  update public.orders set status = 'validated' where id = v_order.id
  returning * into v_order;

  if v_total > 0 then
    select vat_rate into v_vat_rate from public.companies where id = v_order.company_id;
    v_vat := round(v_total * v_vat_rate / 100, 2);

    select id into v_account_411 from public.chart_of_accounts where company_id = v_order.company_id and code = '411';
    select id into v_account_701 from public.chart_of_accounts where company_id = v_order.company_id and code = '701';
    select id into v_account_4431 from public.chart_of_accounts where company_id = v_order.company_id and code = '4431';

    if v_account_411 is null or v_account_701 is null or v_account_4431 is null then
      raise exception 'Plan comptable incomplet pour cette société (comptes 411/701/4431 requis)';
    end if;

    insert into public.journal_entries (company_id, journal_code, description, order_id)
    values (v_order.company_id, 'VENTES', 'Vente #' || left(v_order.id::text, 8), v_order.id)
    returning id into v_entry_id;

    insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
    values (v_entry_id, v_account_411, v_total + v_vat, 0);

    insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
    values (v_entry_id, v_account_701, 0, v_total);

    insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
    values (v_entry_id, v_account_4431, 0, v_vat);
  end if;

  return v_order;
end;
$$;

-- Annulation (Opérateur de vente, sa société) : simplifiée — le stock ne part plus qu'à
-- la validation, donc annuler une commande encore pending ne restaure plus rien (rien
-- n'a été appliqué). Toujours limitée aux commandes pending.
create or replace function public.cancel_order(order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.current_role_name();
  v_caller_company uuid := public.current_company_id();
  v_order public.orders;
begin
  if v_role is null or v_role <> 'sales_operator' then
    raise exception 'Rôle % non autorisé à annuler une commande', coalesce(v_role, '(aucun)');
  end if;

  select * into v_order from public.orders o where o.id = cancel_order.order_id;

  if v_order is null then
    raise exception 'Commande introuvable';
  end if;

  if v_order.company_id is distinct from v_caller_company then
    raise exception 'Impossible d''annuler une commande d''une autre société';
  end if;

  if v_order.status <> 'pending' then
    raise exception 'Seule une commande en attente peut être annulée (statut actuel : %)', v_order.status;
  end if;

  update public.orders set status = 'cancelled' where id = v_order.id
  returning * into v_order;

  return v_order;
end;
$$;

create or replace function public.record_payment(order_id uuid, payment_status public.payment_status, amount_paid numeric)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.current_role_name();
  v_caller_company uuid := public.current_company_id();
  v_order public.orders;
begin
  if v_role is null or v_role <> 'accounting' then
    raise exception 'Rôle % non autorisé à enregistrer un paiement', coalesce(v_role, '(aucun)');
  end if;

  select * into v_order from public.orders o where o.id = record_payment.order_id;

  if v_order is null then
    raise exception 'Commande introuvable';
  end if;

  if v_order.company_id is distinct from v_caller_company then
    raise exception 'Impossible d''enregistrer un paiement pour une commande d''une autre société';
  end if;

  update public.orders
  set payment_status = record_payment.payment_status,
      amount_paid = record_payment.amount_paid
  where id = v_order.id
  returning * into v_order;

  return v_order;
end;
$$;

create or replace function public.create_purchase(payload jsonb)
returns public.purchases
language plpgsql
security definer
set search_path = public
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
      (v_item ->> 'quantity')::integer,
      coalesce((v_item ->> 'unit_cost')::numeric, v_product.price)
    );
  end loop;

  return v_purchase;
end;
$$;

-- Réception (Gestionnaire de magasin) : c'est ici que le stock entre.
create or replace function public.receive_purchase(purchase_id uuid)
returns public.purchases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.current_role_name();
  v_caller_company uuid := public.current_company_id();
  v_purchase public.purchases;
  v_item record;
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
    insert into public.transactions (product_id, type, quantity, user_id, warehouse_id, purchase_id)
    values (v_item.product_id, 'IN', v_item.quantity, auth.uid(), v_purchase.warehouse_id, v_purchase.id);

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

create or replace function public.cancel_purchase(purchase_id uuid)
returns public.purchases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.current_role_name();
  v_caller_company uuid := public.current_company_id();
  v_purchase public.purchases;
begin
  if v_role is null or v_role <> 'purchasing' then
    raise exception 'Rôle % non autorisé à annuler un achat', coalesce(v_role, '(aucun)');
  end if;

  select * into v_purchase from public.purchases p where p.id = cancel_purchase.purchase_id;

  if v_purchase is null then
    raise exception 'Achat introuvable';
  end if;

  if v_purchase.company_id is distinct from v_caller_company then
    raise exception 'Impossible d''annuler un achat d''une autre société';
  end if;

  if v_purchase.status <> 'pending' then
    raise exception 'Seul un achat en attente peut être annulé (statut actuel : %)', v_purchase.status;
  end if;

  update public.purchases set status = 'cancelled' where id = v_purchase.id
  returning * into v_purchase;

  return v_purchase;
end;
$$;

create or replace function public.create_production(payload jsonb)
returns public.productions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.current_role_name();
  v_caller_company uuid := public.current_company_id();
  v_warehouse_id uuid := (payload ->> 'warehouse_id')::uuid;
  v_production public.productions;
  v_item jsonb;
  v_product public.products;
  v_quantity integer;
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

    v_quantity := (v_item ->> 'quantity')::integer;
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
returns public.transformations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.current_role_name();
  v_caller_company uuid := public.current_company_id();
  v_warehouse_id uuid := (payload ->> 'warehouse_id')::uuid;
  v_transformation public.transformations;
  v_item jsonb;
  v_product public.products;
  v_quantity integer;
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

    v_quantity := (v_item ->> 'quantity')::integer;

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

    v_quantity := (v_item ->> 'quantity')::integer;
    v_unit_cost := coalesce((v_item ->> 'unit_cost')::numeric, v_product.price);

    insert into public.transformation_outputs (transformation_id, product_id, quantity, unit_cost)
    values (v_transformation.id, v_product.id, v_quantity, v_unit_cost);

    insert into public.transactions (product_id, type, quantity, user_id, warehouse_id, transformation_id)
    values (v_product.id, 'IN', v_quantity, auth.uid(), v_warehouse_id, v_transformation.id);
  end loop;

  return v_transformation;
end;
$$;

-- ============================================================================
-- Traçabilité de la consultation : réutilise le journal d'audit existant (public.logs)
-- plutôt qu'un système parallèle. Le frontend appelle cette RPC à chaque changement de
-- route (voir src/lib/useLogPageVisit.ts) — version "légère" assumée : journalise la
-- navigation, pas chaque requête SELECT individuelle.
-- ============================================================================

create or replace function public.log_page_visit(module text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.logs (user_id, action, module, metadata)
  values (auth.uid(), 'VIEW', module, null);
end;
$$;

grant execute on function public.log_page_visit(text) to authenticated;
