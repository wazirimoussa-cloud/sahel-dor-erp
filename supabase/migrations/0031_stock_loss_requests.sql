-- Circuit d'approbation pour les pertes de stock constatees en magasin (sacs dechires,
-- etc.) et le reconditionnement avec perte (meme produit, quantite recuperee < quantite
-- de depart). Objectif : empecher qu'une perte declaree unilateralement par le
-- gestionnaire de magasin / responsable de production serve a couvrir un vol - separation
-- des taches deja appliquee ailleurs (commandes creees par sales_operator, validees par
-- supervisor ; achats crees par purchasing, receptionnes par warehouse_manager).
--
-- Le demandeur (warehouse_manager, production_manager, logistics_transport) DECLARE une
-- perte ; elle ne sort du stock qu'apres validation par le Controleur. Deux cas :
--   - perte seche (repackaged_quantity = null) : approbation cree une transaction
--     ADJUSTMENT negative.
--   - reconditionnement (repackaged_quantity renseigne, < quantity) : approbation cree
--     une transformation avec le meme produit en intrant (quantity) et en extrant
--     (repackaged_quantity) - la perte est la difference. Volontairement distinct de la
--     RPC create_transformation (reservee a production_manager pour ses transformations
--     multi-produits normales) afin qu'aucun contournement de l'approbation ne soit
--     possible via l'ecran Transformation existant.
create table public.stock_loss_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  product_id uuid not null references public.products(id),
  warehouse_id uuid not null references public.warehouses(id),
  quantity numeric(12, 3) not null check (quantity > 0),
  repackaged_quantity numeric(12, 3) check (repackaged_quantity >= 0),
  reason text not null,
  requested_by uuid not null references public.users(id),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.users(id),
  reviewed_at timestamptz,
  rejection_reason text,
  transaction_id uuid references public.transactions(id),
  transformation_id uuid references public.transformations(id),
  created_at timestamptz not null default now(),
  constraint repackaged_quantity_lt_quantity check (repackaged_quantity is null or repackaged_quantity < quantity)
);

alter table public.stock_loss_requests enable row level security;

create policy stock_loss_requests_select on public.stock_loss_requests
  for select to authenticated
  using (company_id = public.current_company_id());

-- Aucune policy insert/update : ecriture exclusivement via les RPC ci-dessous.

create trigger trg_stock_loss_requests_immutable
  before update or delete on public.stock_loss_requests
  for each row
  when (old.status <> 'pending')
  execute function public.fn_block_mutation();

create function public.request_stock_loss(
  p_product_id uuid,
  p_warehouse_id uuid,
  p_quantity numeric,
  p_reason text,
  p_repackaged_quantity numeric default null
)
returns public.stock_loss_requests
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_role text := public.current_role_name();
  v_company uuid := public.current_company_id();
  v_request public.stock_loss_requests;
begin
  if v_role is null or v_role not in ('warehouse_manager', 'production_manager', 'logistics_transport') then
    raise exception 'Rôle % non autorisé à déclarer une perte de stock', coalesce(v_role, '(aucun)');
  end if;

  if v_company is null then
    raise exception 'Aucune société associée à cet utilisateur';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La quantité doit être positive';
  end if;

  if p_repackaged_quantity is not null and p_repackaged_quantity >= p_quantity then
    raise exception 'La quantité reconditionnée doit être inférieure à la quantité de départ';
  end if;

  if trim(coalesce(p_reason, '')) = '' then
    raise exception 'Un motif est requis';
  end if;

  if not exists (select 1 from public.products where id = p_product_id and company_id = v_company) then
    raise exception 'Produit introuvable pour cette société';
  end if;

  if not exists (select 1 from public.warehouses where id = p_warehouse_id and company_id = v_company) then
    raise exception 'Magasin introuvable pour cette société';
  end if;

  insert into public.stock_loss_requests (
    company_id, product_id, warehouse_id, quantity, repackaged_quantity, reason, requested_by
  )
  values (v_company, p_product_id, p_warehouse_id, p_quantity, p_repackaged_quantity, p_reason, auth.uid())
  returning * into v_request;

  return v_request;
end;
$$;

create function public.approve_stock_loss(p_request_id uuid)
returns public.stock_loss_requests
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_role text := public.current_role_name();
  v_company uuid := public.current_company_id();
  v_request public.stock_loss_requests;
  v_transaction_id uuid;
  v_transformation public.transformations;
begin
  if v_role is null or v_role <> 'controller' then
    raise exception 'Rôle % non autorisé à approuver une perte de stock', coalesce(v_role, '(aucun)');
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
    values (v_request.product_id, 'OUT', v_request.quantity, v_request.requested_by, v_request.warehouse_id, v_transformation.id);

    insert into public.transformation_outputs (transformation_id, product_id, quantity, unit_cost)
    select v_transformation.id, v_request.product_id, v_request.repackaged_quantity, price
    from public.products where id = v_request.product_id;

    insert into public.transactions (product_id, type, quantity, user_id, warehouse_id, transformation_id)
    values (v_request.product_id, 'IN', v_request.repackaged_quantity, v_request.requested_by, v_request.warehouse_id, v_transformation.id);

    update public.stock_loss_requests
    set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), transformation_id = v_transformation.id
    where id = p_request_id
    returning * into v_request;
  end if;

  return v_request;
end;
$$;

create function public.reject_stock_loss(p_request_id uuid, p_rejection_reason text)
returns public.stock_loss_requests
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_role text := public.current_role_name();
  v_company uuid := public.current_company_id();
  v_request public.stock_loss_requests;
begin
  if v_role is null or v_role <> 'controller' then
    raise exception 'Rôle % non autorisé à rejeter une perte de stock', coalesce(v_role, '(aucun)');
  end if;

  update public.stock_loss_requests
  set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason = p_rejection_reason
  where id = p_request_id and company_id = v_company and status = 'pending'
  returning * into v_request;

  if v_request is null then
    raise exception 'Demande introuvable ou déjà traitée';
  end if;

  return v_request;
end;
$$;

grant execute on function public.request_stock_loss(uuid, uuid, numeric, text, numeric) to authenticated;
grant execute on function public.approve_stock_loss(uuid) to authenticated;
grant execute on function public.reject_stock_loss(uuid, text) to authenticated;
