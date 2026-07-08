-- Achats (fournisseurs + bons de commande d'achat) — deuxième brique de l'extension
-- agribusiness. Contrairement à create_order (qui décrémente le stock dès la création
-- de la commande, une simplification déjà documentée), le stock ne doit augmenter qu'à
-- la réception réelle de la marchandise : create_purchase() ne touche pas au stock,
-- seul receive_purchase() génère les transactions IN — et seulement une fois, grâce à la
-- vérification du statut 'pending'.

create type public.purchase_status as enum ('pending', 'received', 'cancelled');

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  name text not null,
  contact_name text,
  phone text,
  email text,
  address text,
  created_at timestamptz not null default now()
);

create index suppliers_company_id_idx on public.suppliers (company_id);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  supplier_id uuid not null references public.suppliers (id),
  warehouse_id uuid not null references public.warehouses (id),
  user_id uuid not null references public.users (id),
  status public.purchase_status not null default 'pending',
  created_at timestamptz not null default now()
);

create index purchases_company_id_idx on public.purchases (company_id);

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases (id) on delete cascade,
  product_id uuid not null references public.products (id),
  quantity integer not null check (quantity > 0),
  unit_cost numeric(12, 2) not null check (unit_cost >= 0),
  created_at timestamptz not null default now()
);

create index purchase_items_purchase_id_idx on public.purchase_items (purchase_id);
create index purchase_items_product_id_idx on public.purchase_items (product_id);

-- Traçabilité : une transaction IN générée par une réception d'achat pointe vers l'achat
-- d'origine, comme les transactions OUT pointent déjà vers order_id.
alter table public.transactions add column purchase_id uuid references public.purchases (id);
create index transactions_purchase_id_idx on public.transactions (purchase_id);

-- Création d'un achat : le bon de commande et ses lignes, sans effet sur le stock.
-- payload attendu : {"supplier_id": "uuid", "warehouse_id": "uuid",
--                     "items": [{"product_id": "uuid", "quantity": n, "unit_cost": n?}]}
-- unit_cost optionnel : à défaut, on reprend le prix courant du produit.
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
  if v_role is null or v_role not in ('admin', 'manager') then
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

grant execute on function public.create_purchase(jsonb) to authenticated;

-- Réception d'un achat : génère une transaction IN par ligne (donc incrémente le stock
-- du magasin de l'achat via fn_apply_transaction_stock) et passe le statut à 'received'.
-- La vérification "statut = pending" empêche toute double réception.
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
begin
  if v_role is null or v_role not in ('admin', 'manager') then
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
  end loop;

  update public.purchases set status = 'received' where id = v_purchase.id
  returning * into v_purchase;

  return v_purchase;
end;
$$;

grant execute on function public.receive_purchase(uuid) to authenticated;

-- Annulation d'un achat encore en attente : aucun stock n'a été appliqué à ce stade,
-- donc rien à restaurer — contrairement à la limite connue sur l'annulation des
-- commandes de vente.
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
  if v_role is null or v_role not in ('admin', 'manager') then
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

grant execute on function public.cancel_purchase(uuid) to authenticated;

create trigger trg_audit_suppliers
  after insert or update or delete on public.suppliers
  for each row execute function public.fn_audit_log();

create trigger trg_audit_purchases
  after insert or update or delete on public.purchases
  for each row execute function public.fn_audit_log();

create trigger trg_audit_purchase_items
  after insert or update or delete on public.purchase_items
  for each row execute function public.fn_audit_log();

alter table public.suppliers enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;

-- suppliers : même niveau que products (lecture société, écriture admin/manager).
create policy suppliers_select on public.suppliers
  for select to authenticated
  using (public.current_role_name() = 'admin' or company_id = public.current_company_id());

create policy suppliers_insert on public.suppliers
  for insert to authenticated
  with check (
    public.current_role_name() in ('admin', 'manager')
    and (public.current_role_name() = 'admin' or company_id = public.current_company_id())
  );

create policy suppliers_update on public.suppliers
  for update to authenticated
  using (
    public.current_role_name() in ('admin', 'manager')
    and (public.current_role_name() = 'admin' or company_id = public.current_company_id())
  )
  with check (
    public.current_role_name() in ('admin', 'manager')
    and (public.current_role_name() = 'admin' or company_id = public.current_company_id())
  );

create policy suppliers_delete on public.suppliers
  for delete to authenticated
  using (public.current_role_name() = 'admin');

-- purchases : lecture scopée société ; AUCUNE policy insert/update => uniquement via
-- create_purchase()/receive_purchase()/cancel_purchase() (SECURITY DEFINER), qui
-- appliquent elles-mêmes les règles d'autorisation et garantissent l'atomicité
-- stock+statut.
create policy purchases_select on public.purchases
  for select to authenticated
  using (public.current_role_name() = 'admin' or company_id = public.current_company_id());

-- purchase_items : lecture seule via l'achat parent ; écriture uniquement via la RPC.
create policy purchase_items_select on public.purchase_items
  for select to authenticated
  using (
    exists (
      select 1
      from public.purchases p
      where p.id = purchase_items.purchase_id
        and (public.current_role_name() = 'admin' or p.company_id = public.current_company_id())
    )
  );
