-- Schéma de base : rôles, sociétés, utilisateurs, produits, commandes, transactions, logs.
-- Voir le cahier des charges (section 2) pour le modèle de données de départ ; ce fichier
-- l'étend avec des types, contraintes et clés que le cahier ne détaillait pas
-- (order_items, company_id sur users/products/orders, enums, index).

create extension if not exists "pgcrypto";

create type transaction_type as enum ('IN', 'OUT', 'ADJUSTMENT');
create type order_status as enum ('pending', 'validated', 'cancelled');

-- 1. Rôles (données de référence, RBAC)
create table public.roles (
  id smallint generated always as identity primary key,
  name text not null unique
);

-- 2. Sociétés
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- 3. Profils utilisateurs (étend auth.users)
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  role_id smallint not null references public.roles (id),
  company_id uuid references public.companies (id),
  created_at timestamptz not null default now()
);

create index users_company_id_idx on public.users (company_id);
create index users_role_id_idx on public.users (role_id);

-- 4. Produits
create table public.products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  name text not null,
  price numeric(12, 2) not null check (price >= 0),
  stock integer not null default 0 check (stock >= 0),
  created_at timestamptz not null default now()
);

create index products_company_id_idx on public.products (company_id);

-- 5. Commandes (le cahier ne liste qu'une table "orders" sans colonnes ;
--    on la complète avec order_items pour porter plusieurs produits/quantités)
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  user_id uuid not null references public.users (id),
  status order_status not null default 'pending',
  created_at timestamptz not null default now()
);

create index orders_company_id_idx on public.orders (company_id);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid not null references public.products (id),
  quantity integer not null check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  created_at timestamptz not null default now()
);

create index order_items_order_id_idx on public.order_items (order_id);
create index order_items_product_id_idx on public.order_items (product_id);

-- 6. Transactions (grand livre des mouvements de stock, append-only)
--    quantity est toujours positif pour IN/OUT (la direction vient de "type") ;
--    pour ADJUSTMENT, quantity porte le signe de la correction.
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id),
  type transaction_type not null,
  quantity integer not null,
  user_id uuid not null references public.users (id),
  order_id uuid references public.orders (id),
  created_at timestamptz not null default now(),
  constraint transactions_quantity_check check (
    (type in ('IN', 'OUT') and quantity > 0) or (type = 'ADJUSTMENT' and quantity <> 0)
  )
);

create index transactions_product_id_idx on public.transactions (product_id);
create index transactions_created_at_idx on public.transactions (created_at desc);

-- 7. Journal d'audit (append-only, alimenté uniquement par des triggers serveur — voir 0002)
create table public.logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users (id),
  action text not null,
  module text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index logs_module_idx on public.logs (module);
create index logs_created_at_idx on public.logs (created_at desc);
