-- Transformation — troisième maillon de l'extension agribusiness. Contrairement à la
-- production (qui crée du stock sans rien consommer), une transformation convertit un ou
-- plusieurs produits en stock (intrants, ex. grain brut) en un ou plusieurs produits
-- différents (extrants, ex. farine), dans un seul magasin. Fait atomique immédiat, comme
-- la production : pas de statut, pas d'étape différée.

create table public.transformations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  warehouse_id uuid not null references public.warehouses (id),
  user_id uuid not null references public.users (id),
  created_at timestamptz not null default now()
);

create index transformations_company_id_idx on public.transformations (company_id);

create table public.transformation_inputs (
  id uuid primary key default gen_random_uuid(),
  transformation_id uuid not null references public.transformations (id) on delete cascade,
  product_id uuid not null references public.products (id),
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now()
);

create index transformation_inputs_transformation_id_idx on public.transformation_inputs (transformation_id);
create index transformation_inputs_product_id_idx on public.transformation_inputs (product_id);

create table public.transformation_outputs (
  id uuid primary key default gen_random_uuid(),
  transformation_id uuid not null references public.transformations (id) on delete cascade,
  product_id uuid not null references public.products (id),
  quantity integer not null check (quantity > 0),
  unit_cost numeric(12, 2) not null check (unit_cost >= 0),
  created_at timestamptz not null default now()
);

create index transformation_outputs_transformation_id_idx on public.transformation_outputs (transformation_id);
create index transformation_outputs_product_id_idx on public.transformation_outputs (product_id);

-- Traçabilité : les transactions OUT (intrants consommés) et IN (extrants produits)
-- générées par une transformation pointent vers l'événement d'origine.
alter table public.transactions add column transformation_id uuid references public.transformations (id);
create index transactions_transformation_id_idx on public.transactions (transformation_id);

-- Création d'une transformation : en-tête + intrants + extrants + transactions
-- OUT (intrants) puis IN (extrants), tout en une fois.
-- payload attendu : {"warehouse_id": "uuid",
--                     "inputs": [{"product_id": "uuid", "quantity": n}],
--                     "outputs": [{"product_id": "uuid", "quantity": n, "unit_cost": n?}]}
-- Les transactions OUT sont insérées en premier : si un intrant dépasse le stock
-- disponible du magasin, le CHECK (stock >= 0) de product_stocks fait échouer toute la
-- fonction — rien n'est appliqué, ni consommation partielle ni extrants créés.
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
  if v_role is null or v_role not in ('admin', 'manager') then
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

grant execute on function public.create_transformation(jsonb) to authenticated;

create trigger trg_audit_transformations
  after insert or update or delete on public.transformations
  for each row execute function public.fn_audit_log();

create trigger trg_audit_transformation_inputs
  after insert or update or delete on public.transformation_inputs
  for each row execute function public.fn_audit_log();

create trigger trg_audit_transformation_outputs
  after insert or update or delete on public.transformation_outputs
  for each row execute function public.fn_audit_log();

alter table public.transformations enable row level security;
alter table public.transformation_inputs enable row level security;
alter table public.transformation_outputs enable row level security;

-- transformations : lecture scopée société ; AUCUNE policy insert/update => uniquement
-- via create_transformation() (SECURITY DEFINER).
create policy transformations_select on public.transformations
  for select to authenticated
  using (public.current_role_name() = 'admin' or company_id = public.current_company_id());

create policy transformation_inputs_select on public.transformation_inputs
  for select to authenticated
  using (
    exists (
      select 1
      from public.transformations t
      where t.id = transformation_inputs.transformation_id
        and (public.current_role_name() = 'admin' or t.company_id = public.current_company_id())
    )
  );

create policy transformation_outputs_select on public.transformation_outputs
  for select to authenticated
  using (
    exists (
      select 1
      from public.transformations t
      where t.id = transformation_outputs.transformation_id
        and (public.current_role_name() = 'admin' or t.company_id = public.current_company_id())
    )
  );
