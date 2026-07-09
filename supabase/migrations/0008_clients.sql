-- Clients — première brique du maillon Vente. Table jumelle exacte de suppliers (0005) :
-- mêmes colonnes, mêmes policies, même trigger d'audit.

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  name text not null,
  contact_name text,
  phone text,
  email text,
  address text,
  created_at timestamptz not null default now()
);

create index clients_company_id_idx on public.clients (company_id);

create trigger trg_audit_clients
  after insert or update or delete on public.clients
  for each row execute function public.fn_audit_log();

alter table public.clients enable row level security;

create policy clients_select on public.clients
  for select to authenticated
  using (public.current_role_name() = 'admin' or company_id = public.current_company_id());

create policy clients_insert on public.clients
  for insert to authenticated
  with check (
    public.current_role_name() in ('admin', 'manager')
    and (public.current_role_name() = 'admin' or company_id = public.current_company_id())
  );

create policy clients_update on public.clients
  for update to authenticated
  using (
    public.current_role_name() in ('admin', 'manager')
    and (public.current_role_name() = 'admin' or company_id = public.current_company_id())
  )
  with check (
    public.current_role_name() in ('admin', 'manager')
    and (public.current_role_name() = 'admin' or company_id = public.current_company_id())
  );

create policy clients_delete on public.clients
  for delete to authenticated
  using (public.current_role_name() = 'admin');
