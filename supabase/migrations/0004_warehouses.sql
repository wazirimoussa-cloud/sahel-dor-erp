-- Magasins (entrepôts) et stock par magasin — première brique de l'extension agribusiness
-- (Achat → Production → Transformation → Stock multi-magasins → Vente → Comptabilité).
-- Jusqu'ici products.stock était un scalaire global unique ; ce fichier introduit
-- product_stocks comme véritable source de vérité par (produit, magasin), tout en
-- conservant products.stock comme total dénormalisé (pratique pour les alertes "stock
-- bas" déjà affichées sur le tableau de bord, sans avoir à réécrire cet écran).

create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  name text not null,
  location text,
  created_at timestamptz not null default now()
);

create index warehouses_company_id_idx on public.warehouses (company_id);

create table public.product_stocks (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id),
  warehouse_id uuid not null references public.warehouses (id),
  stock integer not null default 0 check (stock >= 0),
  unique (product_id, warehouse_id)
);

create index product_stocks_product_id_idx on public.product_stocks (product_id);
create index product_stocks_warehouse_id_idx on public.product_stocks (warehouse_id);

-- Bootstrap : un magasin "Magasin principal" par société existante, pour pouvoir
-- rattacher les transactions et le stock déjà en base avant l'introduction des magasins.
insert into public.warehouses (company_id, name)
select id, 'Magasin principal' from public.companies;

alter table public.transactions add column warehouse_id uuid references public.warehouses (id);

-- Le backfill ci-dessous est un UPDATE sur transactions, normalement bloqué sans
-- exception par trg_transactions_immutable (grand livre append-only, y compris pour les
-- migrations de schéma). On le désactive le temps strict de ce backfill puis on le
-- réactive aussitôt après — la ligne de transaction existante n'est pas altérée sur le
-- fond, seul un nouveau champ obligatoire est renseigné rétroactivement.
alter table public.transactions disable trigger trg_transactions_immutable;

update public.transactions t
set warehouse_id = w.id
from public.products p
join public.warehouses w on w.company_id = p.company_id and w.name = 'Magasin principal'
where t.product_id = p.id;

alter table public.transactions enable trigger trg_transactions_immutable;

alter table public.transactions alter column warehouse_id set not null;

create index transactions_warehouse_id_idx on public.transactions (warehouse_id);

-- Backfill du stock par magasin depuis les totaux existants (tout imputé au magasin
-- principal, seul magasin connu au moment de la migration).
insert into public.product_stocks (product_id, warehouse_id, stock)
select p.id, w.id, p.stock
from public.products p
join public.warehouses w on w.company_id = p.company_id and w.name = 'Magasin principal';

-- Réécriture du trigger de stock : met à jour le total dénormalisé (products.stock,
-- inchangé pour ne pas casser le dashboard existant) ET le stock par magasin
-- (product_stocks). Le CHECK (stock >= 0) de product_stocks empêche désormais de sortir
-- plus que ce qu'un magasin donné contient réellement, même si le total global suffirait
-- — un mouvement qui violerait ça fait échouer (et annule) toute la transaction, comme
-- pour products.stock auparavant.
--
-- Upsert écrit en UPDATE puis INSERT-si-absent (jamais INSERT ... ON CONFLICT DO UPDATE) :
-- Postgres évalue un CHECK constraint sur la ligne "candidate" d'un INSERT AVANT de
-- résoudre le conflit, donc pour un delta négatif (OUT), la ligne candidate isolée
-- (ex. stock = -2) échoue le CHECK même si le stock existant + delta reste positif
-- (5 - 2 = 3) — le conflit n'est jamais atteint. Le pattern UPDATE-d'abord évite ce piège
-- en évaluant le CHECK sur la valeur réellement fusionnée (stock existant + delta).
create or replace function public.fn_apply_transaction_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delta integer;
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

-- Réécriture de create_order (définie en 0002, avant l'existence des magasins) : les
-- transactions OUT qu'elle génère doivent désormais renseigner warehouse_id, devenu
-- NOT NULL sur transactions dans cette même migration. payload étendu avec
-- "warehouse_id" (obligatoire, validé comme appartenant à la société de l'appelant,
-- même garde-fou que pour create_purchase/create_production).
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
  v_order public.orders;
  v_item jsonb;
  v_product public.products;
begin
  if v_role is null or v_role not in ('admin', 'manager', 'seller') then
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

  insert into public.orders (company_id, user_id, status)
  values (v_company_id, auth.uid(), 'pending')
  returning * into v_order;

  for v_item in select * from jsonb_array_elements(payload -> 'items')
  loop
    select * into v_product from public.products where id = (v_item ->> 'product_id')::uuid;

    if v_product is null or v_product.company_id <> v_company_id then
      raise exception 'Produit % introuvable pour cette société', v_item ->> 'product_id';
    end if;

    insert into public.order_items (order_id, product_id, quantity, unit_price)
    values (v_order.id, v_product.id, (v_item ->> 'quantity')::integer, v_product.price);

    insert into public.transactions (product_id, type, quantity, user_id, warehouse_id, order_id)
    values (v_product.id, 'OUT', (v_item ->> 'quantity')::integer, auth.uid(), v_warehouse_id, v_order.id);
  end loop;

  return v_order;
end;
$$;

create trigger trg_audit_warehouses
  after insert or update or delete on public.warehouses
  for each row execute function public.fn_audit_log();

alter table public.warehouses enable row level security;
alter table public.product_stocks enable row level security;

-- warehouses : lecture pour toute la société (admin voit tout), écriture admin/manager
-- (même niveau que products).
create policy warehouses_select on public.warehouses
  for select to authenticated
  using (public.current_role_name() = 'admin' or company_id = public.current_company_id());

create policy warehouses_insert on public.warehouses
  for insert to authenticated
  with check (
    public.current_role_name() in ('admin', 'manager')
    and (public.current_role_name() = 'admin' or company_id = public.current_company_id())
  );

create policy warehouses_update on public.warehouses
  for update to authenticated
  using (
    public.current_role_name() in ('admin', 'manager')
    and (public.current_role_name() = 'admin' or company_id = public.current_company_id())
  )
  with check (
    public.current_role_name() in ('admin', 'manager')
    and (public.current_role_name() = 'admin' or company_id = public.current_company_id())
  );

create policy warehouses_delete on public.warehouses
  for delete to authenticated
  using (public.current_role_name() = 'admin');

-- product_stocks : lecture seule scopée société (via le magasin) — écrit uniquement par
-- fn_apply_transaction_stock (SECURITY DEFINER, propriétaire postgres, hors RLS).
create policy product_stocks_select on public.product_stocks
  for select to authenticated
  using (
    exists (
      select 1
      from public.warehouses w
      where w.id = product_stocks.warehouse_id
        and (public.current_role_name() = 'admin' or w.company_id = public.current_company_id())
    )
  );
