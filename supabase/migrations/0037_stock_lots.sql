-- Suivi par lot et péremption (FEFO). Le stock est aujourd'hui suivi en agrégat
-- (product_stocks) sans notion de lot ni de date de péremption -- impossible de savoir
-- quelle partie du stock consommer en priorité (first-expired-first-out) ni de tracer un
-- lot précis en cas de problème qualité, alors que 100% du catalogue est un produit
-- alimentaire périssable.
--
-- Le stock est modifié par SIX RPC différentes (receive_purchase, validate_order,
-- create_production, create_transformation, transfer_stock, approve_stock_loss) PLUS un
-- insert direct depuis le frontend pour les mouvements manuels (StockMovementForm, sous
-- policy RLS transactions_insert, pas une RPC). Dupliquer la logique de lots à ces 7
-- endroits serait fragile. Le seul point qui voit TOUS les mouvements sans exception est
-- le trigger déjà existant fn_apply_transaction_stock() -- la logique de lots s'y ajoute,
-- pas dans les RPC elles-mêmes. Les RPC n'ont qu'à transmettre une expiry_date
-- optionnelle sur les lignes IN qu'elles créent déjà.

-- ============================================================================
-- 1. Colonnes portées par transactions : expiry_date (pertinente sur IN/ADJUSTMENT
--    positif) et unit_cost (surcharge explicite -- seul transfer_stock l'utilise, pour
--    porter le coût moyen pondéré des lots consommés ; les autres RPC laissent le
--    trigger le déduire de purchase_items/production_items/transformation_outputs).
-- ============================================================================

alter table public.transactions add column expiry_date date;
alter table public.transactions add column unit_cost numeric(12, 2);

-- ============================================================================
-- 2. Lots et allocations.
-- ============================================================================

create table public.stock_lots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  product_id uuid not null references public.products (id),
  warehouse_id uuid not null references public.warehouses (id),
  lot_number bigint generated always as identity,
  quantity_received numeric(12, 3) not null check (quantity_received > 0),
  quantity_remaining numeric(12, 3) not null check (quantity_remaining >= 0),
  unit_cost numeric(12, 2) not null default 0,
  expiry_date date,
  source_transaction_id uuid references public.transactions (id),
  created_at timestamptz not null default now()
);

create index stock_lots_product_warehouse_idx on public.stock_lots (product_id, warehouse_id);
create index stock_lots_expiry_idx on public.stock_lots (expiry_date);

alter table public.stock_lots enable row level security;

-- Lecture scopée société ; aucune policy d'écriture -- rempli exclusivement par le
-- trigger fn_apply_transaction_stock (security definer), jamais par un insert applicatif.
create policy stock_lots_select on public.stock_lots
  for select to authenticated
  using (company_id = public.current_company_id());

create table public.transaction_lot_allocations (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions (id),
  lot_id uuid not null references public.stock_lots (id),
  quantity numeric(12, 3) not null check (quantity > 0)
);

create index transaction_lot_allocations_transaction_id_idx on public.transaction_lot_allocations (transaction_id);
create index transaction_lot_allocations_lot_id_idx on public.transaction_lot_allocations (lot_id);

alter table public.transaction_lot_allocations enable row level security;

create policy transaction_lot_allocations_select on public.transaction_lot_allocations
  for select to authenticated
  using (
    exists (
      select 1 from public.stock_lots sl
      where sl.id = transaction_lot_allocations.lot_id and sl.company_id = public.current_company_id()
    )
  );

-- Append-only, comme transactions dont elle découle directement.
create trigger trg_transaction_lot_allocations_immutable
  before update or delete on public.transaction_lot_allocations
  for each row execute function public.fn_block_mutation();

-- ============================================================================
-- 3. Consommation FEFO : boucle sur les lots du produit/magasin, triés par péremption la
--    plus proche (les lots sans péremption connue en dernier, puis par ancienneté --
--    FIFO en repli). Verrouille chaque lot consommé (for update) avant de le décrémenter.
-- ============================================================================

create function public.fn_consume_stock_lots(
  p_transaction_id uuid,
  p_product_id uuid,
  p_warehouse_id uuid,
  p_quantity numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining numeric := p_quantity;
  v_lot record;
  v_take numeric;
begin
  for v_lot in
    select id, quantity_remaining from public.stock_lots
    where product_id = p_product_id and warehouse_id = p_warehouse_id and quantity_remaining > 0
    order by expiry_date nulls last, created_at
    for update
  loop
    exit when v_remaining <= 0;
    v_take := least(v_remaining, v_lot.quantity_remaining);

    update public.stock_lots set quantity_remaining = quantity_remaining - v_take where id = v_lot.id;

    insert into public.transaction_lot_allocations (transaction_id, lot_id, quantity)
    values (p_transaction_id, v_lot.id, v_take);

    v_remaining := v_remaining - v_take;
  end loop;

  if v_remaining > 0 then
    raise exception 'Stock insuffisant en lots pour ce produit/magasin (manque %)', v_remaining;
  end if;
end;
$$;

-- ============================================================================
-- 4. fn_apply_transaction_stock réécrite : logique product_stocks/products inchangée,
--    ajout de la création/consommation de lots selon le signe du mouvement.
-- ============================================================================

create or replace function public.fn_apply_transaction_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delta numeric(12, 3);
  v_unit_cost numeric(12, 2);
  v_company_id uuid;
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

  if v_delta > 0 then
    v_unit_cost := new.unit_cost;

    if v_unit_cost is null then
      select unit_cost into v_unit_cost from public.purchase_items
      where purchase_id = new.purchase_id and product_id = new.product_id limit 1;
    end if;

    if v_unit_cost is null then
      select unit_cost into v_unit_cost from public.production_items
      where production_id = new.production_id and product_id = new.product_id limit 1;
    end if;

    if v_unit_cost is null then
      select unit_cost into v_unit_cost from public.transformation_outputs
      where transformation_id = new.transformation_id and product_id = new.product_id limit 1;
    end if;

    if v_unit_cost is null then
      select price into v_unit_cost from public.products where id = new.product_id;
    end if;

    select company_id into v_company_id from public.products where id = new.product_id;

    insert into public.stock_lots (
      company_id, product_id, warehouse_id, quantity_received, quantity_remaining,
      unit_cost, expiry_date, source_transaction_id
    )
    values (
      v_company_id, new.product_id, new.warehouse_id, v_delta, v_delta,
      coalesce(v_unit_cost, 0), new.expiry_date, new.id
    );
  elsif v_delta < 0 then
    perform public.fn_consume_stock_lots(new.id, new.product_id, new.warehouse_id, -v_delta);
  end if;

  return new;
end;
$$;

-- ============================================================================
-- 5. transfer_stock restructurée : un transfert fait sortir ET entrer le même stock
--    physique -- l'IN à destination doit hériter de la péremption/du coût des lots
--    réellement consommés à la source, pas d'un repli générique. Choix conservateur pour
--    la péremption dérivée : la plus proche parmi les lots consommés (ignore les lots
--    sans péremption connue plutôt que de les traiter comme "expire immédiatement") --
--    limite assumée : un transfert mélangeant des lots à péremptions différentes perd
--    cette granularité, le lot destination hérite d'une seule date.
-- ============================================================================

create or replace function public.transfer_stock(
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
  v_caller_company uuid := public.current_company_id();
  v_from_warehouse public.warehouses;
  v_to_warehouse public.warehouses;
  v_transfer_id uuid := gen_random_uuid();
  v_out_transaction_id uuid;
  v_expiry_date date;
  v_unit_cost numeric(12, 2);
begin
  if not public.has_attribution('stock.transfert') then
    raise exception 'Non autorisé à transférer du stock';
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
  )
  returning id into v_out_transaction_id;

  select
    min(sl.expiry_date) filter (where sl.expiry_date is not null),
    case when sum(tla.quantity) > 0 then sum(tla.quantity * sl.unit_cost) / sum(tla.quantity) else null end
  into v_expiry_date, v_unit_cost
  from public.transaction_lot_allocations tla
  join public.stock_lots sl on sl.id = tla.lot_id
  where tla.transaction_id = v_out_transaction_id;

  insert into public.transactions (
    product_id, type, quantity, user_id, warehouse_id, note, transfer_group_id, expiry_date, unit_cost
  )
  values (
    p_product_id, 'IN', p_quantity, auth.uid(), p_to_warehouse_id,
    'Transfert depuis ' || v_from_warehouse.name, v_transfer_id, v_expiry_date, v_unit_cost
  );
end;
$$;

-- ============================================================================
-- 6. receive_purchase / create_production / create_transformation / approve_stock_loss :
--    seul ajout, transmettre expiry_date sur les lignes IN déjà créées. Logique métier
--    interne inchangée par ailleurs (texte repris à l'identique des définitions live via
--    pg_get_functiondef).
-- ============================================================================

create or replace function public.receive_purchase(
  purchase_id uuid,
  losses jsonb default '[]'::jsonb,
  lot_expiry_dates jsonb default '[]'::jsonb
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
  v_entry_id uuid;
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

    if v_quantity_received > 0 then
      insert into public.transactions (product_id, type, quantity, user_id, warehouse_id, purchase_id, expiry_date)
      values (v_item.product_id, 'IN', v_quantity_received, auth.uid(), v_purchase.warehouse_id, v_purchase.id, v_expiry_date);
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

    select * into v_product from public.products where id = v_item.product_id;

    v_total := v_total + (v_item.quantity * v_item.unit_cost);
    if v_product.vat_exempt is not true then
      v_taxable_total := v_taxable_total + (v_item.quantity * v_item.unit_cost);
    end if;
  end loop;

  update public.purchases set status = 'received' where id = v_purchase.id
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
  v_caller_company uuid := public.current_company_id();
  v_warehouse_id uuid := (payload ->> 'warehouse_id')::uuid;
  v_production public.productions;
  v_item jsonb;
  v_product public.products;
  v_quantity numeric(12, 3);
  v_unit_cost numeric(12, 2);
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
    v_unit_cost := coalesce((v_item ->> 'unit_cost')::numeric, v_product.price);

    insert into public.production_items (production_id, product_id, quantity, unit_cost)
    values (v_production.id, v_product.id, v_quantity, v_unit_cost);

    insert into public.transactions (product_id, type, quantity, user_id, warehouse_id, production_id, expiry_date)
    values (v_product.id, 'IN', v_quantity, auth.uid(), v_warehouse_id, v_production.id, (v_item ->> 'expiry_date')::date);
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

    insert into public.transactions (product_id, type, quantity, user_id, warehouse_id, transformation_id, expiry_date)
    values (v_product.id, 'IN', v_quantity, auth.uid(), v_warehouse_id, v_transformation.id, (v_item ->> 'expiry_date')::date);
  end loop;

  return v_transformation;
end;
$$;

create or replace function public.approve_stock_loss(p_request_id uuid)
returns public.stock_loss_requests
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_company uuid := public.current_company_id();
  v_request public.stock_loss_requests;
  v_transaction_id uuid;
  v_transformation public.transformations;
  v_out_transaction_id uuid;
  v_expiry_date date;
begin
  if not public.has_attribution('pertes_stock.approuver') then
    raise exception 'Non autorisé à approuver une perte de stock';
  end if;

  select * into v_request from public.stock_loss_requests
  where id = p_request_id and company_id = v_company and status = 'pending'
  for update;

  if v_request is null then
    raise exception 'Demande introuvable ou déjà traitée';
  end if;

  if v_request.repackaged_quantity is null then
    insert into public.transactions (product_id, type, quantity, user_id, warehouse_id, note)
    values (v_request.product_id, 'ADJUSTMENT', -v_request.quantity, v_request.requested_by, v_request.warehouse_id, v_request.reason)
    returning id into v_transaction_id;

    update public.stock_loss_requests
    set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), transaction_id = v_transaction_id
    where id = p_request_id
    returning * into v_request;
  else
    insert into public.transformations (company_id, warehouse_id, user_id)
    values (v_company, v_request.warehouse_id, v_request.requested_by)
    returning * into v_transformation;

    insert into public.transformation_inputs (transformation_id, product_id, quantity)
    values (v_transformation.id, v_request.product_id, v_request.quantity);

    insert into public.transactions (product_id, type, quantity, user_id, warehouse_id, transformation_id)
    values (v_request.product_id, 'OUT', v_request.quantity, v_request.requested_by, v_request.warehouse_id, v_transformation.id)
    returning id into v_out_transaction_id;

    select min(sl.expiry_date) filter (where sl.expiry_date is not null)
    into v_expiry_date
    from public.transaction_lot_allocations tla
    join public.stock_lots sl on sl.id = tla.lot_id
    where tla.transaction_id = v_out_transaction_id;

    insert into public.transformation_outputs (transformation_id, product_id, quantity, unit_cost)
    select v_transformation.id, v_request.product_id, v_request.repackaged_quantity, price
    from public.products where id = v_request.product_id;

    insert into public.transactions (product_id, type, quantity, user_id, warehouse_id, transformation_id, expiry_date)
    values (v_request.product_id, 'IN', v_request.repackaged_quantity, v_request.requested_by, v_request.warehouse_id, v_transformation.id, v_expiry_date);

    update public.stock_loss_requests
    set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), transformation_id = v_transformation.id
    where id = p_request_id
    returning * into v_request;
  end if;

  return v_request;
end;
$$;

-- ============================================================================
-- 7. Backfill : sans ça, le stock déjà en place (agrégé dans product_stocks depuis
--    toujours) n'aurait aucun lot correspondant -- la toute première consommation sur un
--    produit existant échouerait immédiatement ("stock insuffisant en lots") alors que
--    product_stocks affiche pourtant un solde positif. Un lot d'ouverture synthétique par
--    ligne product_stocks existante (péremption inconnue -- consommé en dernier, après
--    tout lot réellement daté), coût = CUMP des achats réceptionnés si connu (même calcul
--    que useFinancialStatements.ts), sinon prix de vente courant en repli.
-- ============================================================================

insert into public.stock_lots (company_id, product_id, warehouse_id, quantity_received, quantity_remaining, unit_cost, expiry_date, source_transaction_id)
select
  p.company_id,
  ps.product_id,
  ps.warehouse_id,
  ps.stock,
  ps.stock,
  coalesce(
    (
      select sum(pi.quantity * pi.unit_cost) / nullif(sum(pi.quantity), 0)
      from public.purchase_items pi
      join public.purchases pu on pu.id = pi.purchase_id
      where pi.product_id = ps.product_id and pu.status = 'received'
    ),
    p.price
  ),
  null,
  null
from public.product_stocks ps
join public.products p on p.id = ps.product_id
where ps.stock > 0;
