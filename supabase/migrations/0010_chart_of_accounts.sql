-- Comptabilité — dernier maillon de la chaîne. Automatisation simplifiée, PAS une
-- comptabilité SYSCOHADA certifiée complète : couvre uniquement les flux avec tiers
-- externes (fournisseurs, clients) et la trésorerie, dont les montants sont réels et sans
-- ambiguïté. Production et Transformation sont délibérément exclues de cette première
-- passe — production_items.unit_cost / transformation_outputs.unit_cost ne sont que des
-- valeurs par défaut reprenant products.price (le prix de VENTE), pas un coût de revient
-- calculé ; les utiliser produirait des écritures sans sens comptable réel. À traiter
-- une fois une méthode de valorisation (CUMP, coût standard...) définie avec l'utilisateur.

create table public.chart_of_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  code text not null,
  name text not null,
  created_at timestamptz not null default now(),
  unique (company_id, code)
);

create index chart_of_accounts_company_id_idx on public.chart_of_accounts (company_id);

-- Bootstrap : les 5 comptes strictement nécessaires aux écritures générées par cette
-- passe (0011), pour chaque société existante.
insert into public.chart_of_accounts (company_id, code, name)
select c.id, a.code, a.name
from public.companies c
cross join (
  values
    ('401', 'Fournisseurs'),
    ('411', 'Clients'),
    ('521', 'Banques'),
    ('601', 'Achats de marchandises'),
    ('701', 'Ventes de marchandises')
) as a(code, name);

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  entry_date timestamptz not null default now(),
  journal_code text not null,
  description text not null,
  purchase_id uuid references public.purchases (id),
  order_id uuid references public.orders (id),
  created_at timestamptz not null default now()
);

create index journal_entries_company_id_idx on public.journal_entries (company_id);
create index journal_entries_purchase_id_idx on public.journal_entries (purchase_id);
create index journal_entries_order_id_idx on public.journal_entries (order_id);

create table public.journal_entry_lines (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.journal_entries (id) on delete cascade,
  account_id uuid not null references public.chart_of_accounts (id),
  debit numeric(14, 2) not null default 0 check (debit >= 0),
  credit numeric(14, 2) not null default 0 check (credit >= 0),
  created_at timestamptz not null default now(),
  constraint journal_entry_lines_single_side check (not (debit > 0 and credit > 0))
);

create index journal_entry_lines_entry_id_idx on public.journal_entry_lines (entry_id);
create index journal_entry_lines_account_id_idx on public.journal_entry_lines (account_id);

-- Équilibre débit = crédit garanti par écriture, vérifié en fin de transaction (les
-- lignes d'une même écriture sont insérées une par une par la RPC appelante).
create or replace function public.fn_check_journal_entry_balance()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_entry_id uuid;
  v_diff numeric;
begin
  v_entry_id := coalesce(new.entry_id, old.entry_id);

  select coalesce(sum(debit), 0) - coalesce(sum(credit), 0) into v_diff
  from public.journal_entry_lines
  where entry_id = v_entry_id;

  if v_diff is distinct from 0 then
    raise exception 'Écriture % déséquilibrée (écart de %)', v_entry_id, v_diff;
  end if;

  return null;
end;
$$;

create constraint trigger trg_check_journal_entry_balance
  after insert or update or delete on public.journal_entry_lines
  deferrable initially deferred
  for each row execute function public.fn_check_journal_entry_balance();

-- Append-only : comme transactions/logs, aucune correction ne réécrit l'historique —
-- une erreur se corrige par une écriture de contre-passation (fn_block_mutation est déjà
-- générique, définie en 0002).
create trigger trg_journal_entries_immutable
  before update or delete on public.journal_entries
  for each row execute function public.fn_block_mutation();

create trigger trg_journal_entry_lines_immutable
  before update or delete on public.journal_entry_lines
  for each row execute function public.fn_block_mutation();

create trigger trg_audit_chart_of_accounts
  after insert or update or delete on public.chart_of_accounts
  for each row execute function public.fn_audit_log();

alter table public.chart_of_accounts enable row level security;
alter table public.journal_entries enable row level security;
alter table public.journal_entry_lines enable row level security;

-- chart_of_accounts : même niveau que warehouses (lecture société, écriture admin/manager).
create policy chart_of_accounts_select on public.chart_of_accounts
  for select to authenticated
  using (public.current_role_name() = 'admin' or company_id = public.current_company_id());

create policy chart_of_accounts_insert on public.chart_of_accounts
  for insert to authenticated
  with check (
    public.current_role_name() in ('admin', 'manager')
    and (public.current_role_name() = 'admin' or company_id = public.current_company_id())
  );

create policy chart_of_accounts_update on public.chart_of_accounts
  for update to authenticated
  using (
    public.current_role_name() in ('admin', 'manager')
    and (public.current_role_name() = 'admin' or company_id = public.current_company_id())
  )
  with check (
    public.current_role_name() in ('admin', 'manager')
    and (public.current_role_name() = 'admin' or company_id = public.current_company_id())
  );

create policy chart_of_accounts_delete on public.chart_of_accounts
  for delete to authenticated
  using (public.current_role_name() = 'admin');

-- journal_entries / journal_entry_lines : lecture admin/manager/auditor (extension
-- naturelle du rôle auditeur, déjà lecteur du journal d'audit) — AUCUNE policy
-- d'écriture, généré uniquement par les RPC métier (SECURITY DEFINER, voir 0011).
create policy journal_entries_select on public.journal_entries
  for select to authenticated
  using (
    public.current_role_name() in ('admin', 'manager', 'auditor')
    and (public.current_role_name() = 'admin' or company_id = public.current_company_id())
  );

create policy journal_entry_lines_select on public.journal_entry_lines
  for select to authenticated
  using (
    exists (
      select 1
      from public.journal_entries e
      where e.id = journal_entry_lines.entry_id
        and public.current_role_name() in ('admin', 'manager', 'auditor')
        and (public.current_role_name() = 'admin' or e.company_id = public.current_company_id())
    )
  );
