-- Refonte RBAC pour coller à une société d'agribusiness : le rôle générique "manager"
-- concentrait jusqu'ici achats/entrepôts/production/transformation/clients/commandes/
-- comptabilité — éclaté en 4 spécialités (logistique, commercial, comptable, gestionnaire
-- de production). "admin" est inchangé (accès total, slug interne conservé pour ne pas
-- toucher les 3 Edge Functions qui font déjà callerRole === "admin"). "auditor" devient
-- "controller" (lecture seule), avec correction au passage d'un défaut de périmètre :
-- logs n'était filtré par aucune société, un contrôleur non-admin voyait les logs de
-- toutes les sociétés.
--
-- Renommage EN PLACE de 3 lignes existantes (manager→logistics, seller→sales,
-- auditor→controller) plutôt que suppression/recréation : role_id est référencé par
-- public.users.role_id, donc les comptes existants héritent automatiquement du bon
-- nouveau rôle sans script de réassignation. 2 lignes réellement nouvelles ajoutées
-- (accounting, production_manager).

update public.roles set name = 'logistics' where name = 'manager';
update public.roles set name = 'sales' where name = 'seller';
update public.roles set name = 'controller' where name = 'auditor';

insert into public.roles (name) values
  ('accounting'),
  ('production_manager')
on conflict (name) do nothing;

-- users : simplifie le cas spécial "manager voit sa société" qui ne correspond plus
-- clairement à aucun des 4 nouveaux rôles opérationnels — chacun voit sa propre ligne,
-- admin voit tout (déjà le comportement de base pour sales/accounting/controller/
-- production_manager).
drop policy users_select on public.users;

create policy users_select on public.users
  for select to authenticated
  using (
    id = auth.uid()
    or public.current_role_name() = 'admin'
  );

-- products : écriture logistique (achats) + gestionnaire de production (produits
-- transformés/récoltés).
drop policy products_insert on public.products;

create policy products_insert on public.products
  for insert to authenticated
  with check (
    public.current_role_name() in ('admin', 'logistics', 'production_manager')
    and (public.current_role_name() = 'admin' or company_id = public.current_company_id())
  );

drop policy products_update on public.products;

create policy products_update on public.products
  for update to authenticated
  using (
    public.current_role_name() in ('admin', 'logistics', 'production_manager')
    and (public.current_role_name() = 'admin' or company_id = public.current_company_id())
  )
  with check (
    public.current_role_name() in ('admin', 'logistics', 'production_manager')
    and (public.current_role_name() = 'admin' or company_id = public.current_company_id())
  );

-- warehouses : écriture logistique uniquement.
drop policy warehouses_insert on public.warehouses;

create policy warehouses_insert on public.warehouses
  for insert to authenticated
  with check (
    public.current_role_name() in ('admin', 'logistics')
    and (public.current_role_name() = 'admin' or company_id = public.current_company_id())
  );

drop policy warehouses_update on public.warehouses;

create policy warehouses_update on public.warehouses
  for update to authenticated
  using (
    public.current_role_name() in ('admin', 'logistics')
    and (public.current_role_name() = 'admin' or company_id = public.current_company_id())
  )
  with check (
    public.current_role_name() in ('admin', 'logistics')
    and (public.current_role_name() = 'admin' or company_id = public.current_company_id())
  );

-- suppliers : écriture logistique uniquement.
drop policy suppliers_insert on public.suppliers;

create policy suppliers_insert on public.suppliers
  for insert to authenticated
  with check (
    public.current_role_name() in ('admin', 'logistics')
    and (public.current_role_name() = 'admin' or company_id = public.current_company_id())
  );

drop policy suppliers_update on public.suppliers;

create policy suppliers_update on public.suppliers
  for update to authenticated
  using (
    public.current_role_name() in ('admin', 'logistics')
    and (public.current_role_name() = 'admin' or company_id = public.current_company_id())
  )
  with check (
    public.current_role_name() in ('admin', 'logistics')
    and (public.current_role_name() = 'admin' or company_id = public.current_company_id())
  );

-- clients : écriture commercial uniquement.
drop policy clients_insert on public.clients;

create policy clients_insert on public.clients
  for insert to authenticated
  with check (
    public.current_role_name() in ('admin', 'sales')
    and (public.current_role_name() = 'admin' or company_id = public.current_company_id())
  );

drop policy clients_update on public.clients;

create policy clients_update on public.clients
  for update to authenticated
  using (
    public.current_role_name() in ('admin', 'sales')
    and (public.current_role_name() = 'admin' or company_id = public.current_company_id())
  )
  with check (
    public.current_role_name() in ('admin', 'sales')
    and (public.current_role_name() = 'admin' or company_id = public.current_company_id())
  );

-- chart_of_accounts : écriture comptable uniquement.
drop policy chart_of_accounts_insert on public.chart_of_accounts;

create policy chart_of_accounts_insert on public.chart_of_accounts
  for insert to authenticated
  with check (
    public.current_role_name() in ('admin', 'accounting')
    and (public.current_role_name() = 'admin' or company_id = public.current_company_id())
  );

drop policy chart_of_accounts_update on public.chart_of_accounts;

create policy chart_of_accounts_update on public.chart_of_accounts
  for update to authenticated
  using (
    public.current_role_name() in ('admin', 'accounting')
    and (public.current_role_name() = 'admin' or company_id = public.current_company_id())
  )
  with check (
    public.current_role_name() in ('admin', 'accounting')
    and (public.current_role_name() = 'admin' or company_id = public.current_company_id())
  );

-- journal_entries / journal_entry_lines : lecture admin/comptable/contrôleur (plus
-- large "manager", extension propre du rôle financier et du rôle de contrôle).
drop policy journal_entries_select on public.journal_entries;

create policy journal_entries_select on public.journal_entries
  for select to authenticated
  using (
    public.current_role_name() in ('admin', 'accounting', 'controller')
    and (public.current_role_name() = 'admin' or company_id = public.current_company_id())
  );

drop policy journal_entry_lines_select on public.journal_entry_lines;

create policy journal_entry_lines_select on public.journal_entry_lines
  for select to authenticated
  using (
    exists (
      select 1
      from public.journal_entries e
      where e.id = journal_entry_lines.entry_id
        and public.current_role_name() in ('admin', 'accounting', 'controller')
        and (public.current_role_name() = 'admin' or e.company_id = public.current_company_id())
    )
  );

-- transactions : mouvement de stock manuel réservé aux rôles qui manipulent
-- physiquement le stock (logistique, gestionnaire de production).
drop policy transactions_insert on public.transactions;

create policy transactions_insert on public.transactions
  for insert to authenticated
  with check (
    public.current_role_name() in ('admin', 'logistics', 'production_manager')
    and exists (
      select 1
      from public.products p
      where p.id = transactions.product_id
        and (public.current_role_name() = 'admin' or p.company_id = public.current_company_id())
    )
  );

-- logs : correction du défaut de périmètre — le contrôleur (non-admin) ne voit plus que
-- les logs de sa propre société (via la société de l'auteur du log), comme partout
-- ailleurs dans l'app. admin garde une vue cross-société inchangée.
drop policy logs_select on public.logs;

create policy logs_select on public.logs
  for select to authenticated
  using (
    public.current_role_name() = 'admin'
    or (
      public.current_role_name() = 'controller'
      and exists (
        select 1 from public.users u
        where u.id = logs.user_id and u.company_id = public.current_company_id()
      )
    )
  );

-- RPC : remplace uniquement les listes de rôles autorisés, logique métier inchangée.

create or replace function public.create_purchase(payload jsonb)
returns public.purchases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.current_role_name();
  v_caller_company uuid := public.current_company_id();
  v_company_id uuid;
  v_supplier_id uuid := (payload ->> 'supplier_id')::uuid;
  v_warehouse_id uuid := (payload ->> 'warehouse_id')::uuid;
  v_purchase public.purchases;
  v_item jsonb;
  v_product public.products;
begin
  if v_role is null or v_role not in ('admin', 'logistics') then
    raise exception 'Rôle % non autorisé à créer un achat', coalesce(v_role, '(aucun)');
  end if;

  v_company_id := v_caller_company;

  if v_company_id is null then
    raise exception 'Aucune société associée à cet utilisateur';
  end if;

  if not exists (
    select 1 from public.suppliers s where s.id = v_supplier_id and s.company_id = v_company_id
  ) then
    raise exception 'Fournisseur introuvable pour cette société';
  end if;

  if not exists (
    select 1 from public.warehouses w where w.id = v_warehouse_id and w.company_id = v_company_id
  ) then
    raise exception 'Magasin introuvable pour cette société';
  end if;

  insert into public.purchases (company_id, supplier_id, warehouse_id, user_id, status)
  values (v_company_id, v_supplier_id, v_warehouse_id, auth.uid(), 'pending')
  returning * into v_purchase;

  for v_item in select * from jsonb_array_elements(payload -> 'items')
  loop
    select * into v_product from public.products where id = (v_item ->> 'product_id')::uuid;

    if v_product is null or v_product.company_id <> v_company_id then
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
  if v_role is null or v_role not in ('admin', 'logistics') then
    raise exception 'Rôle % non autorisé à réceptionner un achat', coalesce(v_role, '(aucun)');
  end if;

  select * into v_purchase from public.purchases p where p.id = receive_purchase.purchase_id;

  if v_purchase is null then
    raise exception 'Achat introuvable';
  end if;

  if v_role <> 'admin' and v_purchase.company_id is distinct from v_caller_company then
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
  if v_role is null or v_role not in ('admin', 'logistics') then
    raise exception 'Rôle % non autorisé à annuler un achat', coalesce(v_role, '(aucun)');
  end if;

  select * into v_purchase from public.purchases p where p.id = cancel_purchase.purchase_id;

  if v_purchase is null then
    raise exception 'Achat introuvable';
  end if;

  if v_role <> 'admin' and v_purchase.company_id is distinct from v_caller_company then
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
  if v_role is null or v_role not in ('admin', 'production_manager') then
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
  if v_role is null or v_role not in ('admin', 'production_manager') then
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

create or replace function public.create_order(payload jsonb)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.current_role_name();
  v_caller_company uuid := public.current_company_id();
  v_company_id uuid;
  v_warehouse_id uuid := (payload ->> 'warehouse_id')::uuid;
  v_client_id uuid := (payload ->> 'client_id')::uuid;
  v_order public.orders;
  v_item jsonb;
  v_product public.products;
  v_total numeric(14, 2) := 0;
  v_quantity integer;
  v_vat_rate numeric(5, 2);
  v_vat numeric(14, 2);
  v_account_411 uuid;
  v_account_701 uuid;
  v_account_4431 uuid;
  v_entry_id uuid;
begin
  if v_role is null or v_role not in ('admin', 'sales') then
    raise exception 'Rôle % non autorisé à créer une commande', coalesce(v_role, '(aucun)');
  end if;

  v_company_id := coalesce((payload ->> 'company_id')::uuid, v_caller_company);

  if v_role <> 'admin' and v_company_id is distinct from v_caller_company then
    raise exception 'Impossible de créer une commande pour une autre société';
  end if;

  if v_company_id is null then
    raise exception 'Aucune société associée à cet utilisateur';
  end if;

  if not exists (
    select 1 from public.warehouses w where w.id = v_warehouse_id and w.company_id = v_company_id
  ) then
    raise exception 'Magasin introuvable pour cette société';
  end if;

  if not exists (
    select 1 from public.clients c where c.id = v_client_id and c.company_id = v_company_id
  ) then
    raise exception 'Client introuvable pour cette société';
  end if;

  insert into public.orders (company_id, user_id, status, client_id)
  values (v_company_id, auth.uid(), 'pending', v_client_id)
  returning * into v_order;

  for v_item in select * from jsonb_array_elements(payload -> 'items')
  loop
    select * into v_product from public.products where id = (v_item ->> 'product_id')::uuid;

    if v_product is null or v_product.company_id <> v_company_id then
      raise exception 'Produit % introuvable pour cette société', v_item ->> 'product_id';
    end if;

    v_quantity := (v_item ->> 'quantity')::integer;

    insert into public.order_items (order_id, product_id, quantity, unit_price)
    values (v_order.id, v_product.id, v_quantity, v_product.price);

    insert into public.transactions (product_id, type, quantity, user_id, warehouse_id, order_id)
    values (v_product.id, 'OUT', v_quantity, auth.uid(), v_warehouse_id, v_order.id);

    v_total := v_total + (v_quantity * v_product.price);
  end loop;

  if v_total > 0 then
    select vat_rate into v_vat_rate from public.companies where id = v_company_id;
    v_vat := round(v_total * v_vat_rate / 100, 2);

    select id into v_account_411 from public.chart_of_accounts where company_id = v_company_id and code = '411';
    select id into v_account_701 from public.chart_of_accounts where company_id = v_company_id and code = '701';
    select id into v_account_4431 from public.chart_of_accounts where company_id = v_company_id and code = '4431';

    if v_account_411 is null or v_account_701 is null or v_account_4431 is null then
      raise exception 'Plan comptable incomplet pour cette société (comptes 411/701/4431 requis)';
    end if;

    insert into public.journal_entries (company_id, journal_code, description, order_id)
    values (v_company_id, 'VENTES', 'Vente #' || left(v_order.id::text, 8), v_order.id)
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
begin
  if v_role is null or v_role not in ('admin', 'sales') then
    raise exception 'Rôle % non autorisé à valider une commande', coalesce(v_role, '(aucun)');
  end if;

  select * into v_order from public.orders o where o.id = validate_order.order_id;

  if v_order is null then
    raise exception 'Commande introuvable';
  end if;

  if v_role <> 'admin' and v_order.company_id is distinct from v_caller_company then
    raise exception 'Impossible de valider une commande d''une autre société';
  end if;

  if v_order.status <> 'pending' then
    raise exception 'Seule une commande en attente peut être validée (statut actuel : %)', v_order.status;
  end if;

  update public.orders set status = 'validated' where id = v_order.id
  returning * into v_order;

  return v_order;
end;
$$;

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
  v_item record;
  v_warehouse_id uuid;
  v_total numeric(14, 2) := 0;
  v_vat_rate numeric(5, 2);
  v_vat numeric(14, 2);
  v_account_411 uuid;
  v_account_701 uuid;
  v_account_4431 uuid;
  v_entry_id uuid;
begin
  if v_role is null or v_role not in ('admin', 'sales') then
    raise exception 'Rôle % non autorisé à annuler une commande', coalesce(v_role, '(aucun)');
  end if;

  select * into v_order from public.orders o where o.id = cancel_order.order_id;

  if v_order is null then
    raise exception 'Commande introuvable';
  end if;

  if v_role <> 'admin' and v_order.company_id is distinct from v_caller_company then
    raise exception 'Impossible d''annuler une commande d''une autre société';
  end if;

  if v_order.status <> 'pending' then
    raise exception 'Seule une commande en attente peut être annulée (statut actuel : %)', v_order.status;
  end if;

  select t.warehouse_id into v_warehouse_id
  from public.transactions t
  where t.order_id = v_order.id
  limit 1;

  for v_item in select * from public.order_items where order_items.order_id = v_order.id
  loop
    insert into public.transactions (product_id, type, quantity, user_id, warehouse_id, order_id)
    values (v_item.product_id, 'ADJUSTMENT', v_item.quantity, auth.uid(), v_warehouse_id, v_order.id);

    v_total := v_total + (v_item.quantity * v_item.unit_price);
  end loop;

  update public.orders set status = 'cancelled' where id = v_order.id
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
    values (v_order.company_id, 'VENTES', 'Annulation vente #' || left(v_order.id::text, 8), v_order.id)
    returning id into v_entry_id;

    -- Contre-passation exacte de l'écriture de vente d'origine (sens inversé, 3 lignes).
    insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
    values (v_entry_id, v_account_701, v_total, 0);

    insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
    values (v_entry_id, v_account_4431, v_vat, 0);

    insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
    values (v_entry_id, v_account_411, 0, v_total + v_vat);
  end if;

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
  if v_role is null or v_role not in ('admin', 'sales') then
    raise exception 'Rôle % non autorisé à enregistrer un paiement', coalesce(v_role, '(aucun)');
  end if;

  select * into v_order from public.orders o where o.id = record_payment.order_id;

  if v_order is null then
    raise exception 'Commande introuvable';
  end if;

  if v_role <> 'admin' and v_order.company_id is distinct from v_caller_company then
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
