-- RLS scopée par rôle réel, via current_role_name()/current_company_id() (0002).
-- Le cahier des charges ne donnait qu'un exemple restreignant "users" à sa propre ligne
-- (auth.uid() = id) : ce n'est pas du RBAC, juste de l'isolation par ligne. Ici chaque
-- table a des policies qui distinguent réellement admin / manager / seller / auditor et
-- qui scopent par société (company_id) pour le multi-société.

alter table public.roles enable row level security;
alter table public.companies enable row level security;
alter table public.users enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.transactions enable row level security;
alter table public.logs enable row level security;

-- roles : données de référence en lecture seule pour tout utilisateur connecté ;
-- aucune policy insert/update/delete => interdit par défaut pour "authenticated".
create policy roles_select_all on public.roles
  for select to authenticated
  using (true);

-- companies
create policy companies_select on public.companies
  for select to authenticated
  using (public.current_role_name() = 'admin' or id = public.current_company_id());

create policy companies_admin_write on public.companies
  for all to authenticated
  using (public.current_role_name() = 'admin')
  with check (public.current_role_name() = 'admin');

-- users : chacun voit son propre profil ; admin voit tout ; manager voit sa société.
-- L'écriture (changement de rôle/société) reste réservée à l'admin — la création de
-- compte se fait via l'Edge Function create-user (clé service_role, hors RLS).
create policy users_select on public.users
  for select to authenticated
  using (
    id = auth.uid()
    or public.current_role_name() = 'admin'
    or (public.current_role_name() = 'manager' and company_id = public.current_company_id())
  );

create policy users_admin_write on public.users
  for update to authenticated
  using (public.current_role_name() = 'admin')
  with check (public.current_role_name() = 'admin');

-- products : lecture scopée à la société (admin voit tout) ; écriture admin/manager.
create policy products_select on public.products
  for select to authenticated
  using (public.current_role_name() = 'admin' or company_id = public.current_company_id());

create policy products_insert on public.products
  for insert to authenticated
  with check (
    public.current_role_name() in ('admin', 'manager')
    and (public.current_role_name() = 'admin' or company_id = public.current_company_id())
  );

create policy products_update on public.products
  for update to authenticated
  using (
    public.current_role_name() in ('admin', 'manager')
    and (public.current_role_name() = 'admin' or company_id = public.current_company_id())
  )
  with check (
    public.current_role_name() in ('admin', 'manager')
    and (public.current_role_name() = 'admin' or company_id = public.current_company_id())
  );

create policy products_delete on public.products
  for delete to authenticated
  using (public.current_role_name() = 'admin');

-- orders : lecture scopée société ; changement de statut par admin/manager ;
-- PAS de policy insert => la création ne passe que par la RPC create_order()
-- (SECURITY DEFINER), qui applique elle-même les règles d'autorisation.
create policy orders_select on public.orders
  for select to authenticated
  using (public.current_role_name() = 'admin' or company_id = public.current_company_id());

create policy orders_update_status on public.orders
  for update to authenticated
  using (
    public.current_role_name() in ('admin', 'manager')
    and (public.current_role_name() = 'admin' or company_id = public.current_company_id())
  )
  with check (
    public.current_role_name() in ('admin', 'manager')
    and (public.current_role_name() = 'admin' or company_id = public.current_company_id())
  );

-- order_items : lecture seule via la commande parente ; écriture uniquement via la RPC.
create policy order_items_select on public.order_items
  for select to authenticated
  using (
    exists (
      select 1
      from public.orders o
      where o.id = order_items.order_id
        and (public.current_role_name() = 'admin' or o.company_id = public.current_company_id())
    )
  );

-- transactions : grand livre en append-only — lecture scopée société, insert pour
-- admin/manager/seller, aucune policy update/delete (bloqué de toute façon par le
-- trigger fn_block_mutation en 0002 — défense en profondeur).
create policy transactions_select on public.transactions
  for select to authenticated
  using (
    public.current_role_name() = 'admin'
    or exists (
      select 1
      from public.products p
      where p.id = transactions.product_id
        and p.company_id = public.current_company_id()
    )
  );

create policy transactions_insert on public.transactions
  for insert to authenticated
  with check (
    public.current_role_name() in ('admin', 'manager', 'seller')
    and exists (
      select 1
      from public.products p
      where p.id = transactions.product_id
        and (public.current_role_name() = 'admin' or p.company_id = public.current_company_id())
    )
  );

-- logs : lecture réservée admin/auditor ; AUCUNE policy insert/update/delete pour
-- "authenticated" => impossible d'écrire dans logs depuis le frontend, seul le trigger
-- fn_audit_log() (SECURITY DEFINER, propriétaire postgres) peut y insérer.
create policy logs_select on public.logs
  for select to authenticated
  using (public.current_role_name() in ('admin', 'auditor'));
