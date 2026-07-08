-- Production — deuxième maillon de l'extension agribusiness (Achat -> Production ->
-- Transformation -> Stock multi-magasins -> Vente -> Comptabilité). Contrairement aux
-- achats (workflow pending/received/cancelled), une production est un fait immédiat :
-- l'entreprise crée elle-même du stock (ex. récolte) sans consommer d'autre produit.
-- La RPC crée l'en-tête, ses lignes, ET les transactions IN correspondantes en une seule
-- fois — pas d'étape de réception différée.

create table public.productions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  warehouse_id uuid not null references public.warehouses (id),
  user_id uuid not null references public.users (id),
  created_at timestamptz not null default now()
);

create index productions_company_id_idx on public.productions (company_id);

create table public.production_items (
  id uuid primary key default gen_random_uuid(),
  production_id uuid not null references public.productions (id) on delete cascade,
  product_id uuid not null references public.products (id),
  quantity integer not null check (quantity > 0),
  unit_cost numeric(12, 2) not null check (unit_cost >= 0),
  created_at timestamptz not null default now()
);

create index production_items_production_id_idx on public.production_items (production_id);
create index production_items_product_id_idx on public.production_items (product_id);

-- Traçabilité : une transaction IN générée par une production pointe vers l'événement
-- d'origine, comme order_id/purchase_id le font déjà.
alter table public.transactions add column production_id uuid references public.productions (id);
create index transactions_production_id_idx on public.transactions (production_id);

-- Création d'une production : en-tête + lignes + transactions IN, tout en une fois.
-- payload attendu : {"warehouse_id": "uuid",
--                     "items": [{"product_id": "uuid", "quantity": n, "unit_cost": n?}]}
-- unit_cost optionnel : à défaut, on reprend le prix courant du produit (comme create_purchase).
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
  if v_role is null or v_role not in ('admin', 'manager') then
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

grant execute on function public.create_production(jsonb) to authenticated;

create trigger trg_audit_productions
  after insert or update or delete on public.productions
  for each row execute function public.fn_audit_log();

create trigger trg_audit_production_items
  after insert or update or delete on public.production_items
  for each row execute function public.fn_audit_log();

alter table public.productions enable row level security;
alter table public.production_items enable row level security;

-- productions : lecture scopée société ; AUCUNE policy insert/update => uniquement via
-- create_production() (SECURITY DEFINER), qui applique elle-même les règles
-- d'autorisation et garantit l'atomicité stock+traçabilité.
create policy productions_select on public.productions
  for select to authenticated
  using (public.current_role_name() = 'admin' or company_id = public.current_company_id());

create policy production_items_select on public.production_items
  for select to authenticated
  using (
    exists (
      select 1
      from public.productions p
      where p.id = production_items.production_id
        and (public.current_role_name() = 'admin' or p.company_id = public.current_company_id())
    )
  );
