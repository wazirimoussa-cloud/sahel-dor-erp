-- Module paie v1 : employés + bulletins de paie, décision confirmée avec
-- l'utilisateur après vérification du CGI (voir points 46/49 du README, barème ITS
-- de référence) — le calcul réel de l'ITS par bulletin dépend d'un enchaînement de
-- déductions (retenue pension plafonnée à 6% Art. 60, abattement 10% frais
-- professionnels, abattement charges de famille Art. 65) dont l'ordre exact
-- d'application n'est pas garanti par le texte fourni, et la cotisation pension/CNSS
-- réelle relève d'un texte hors CGI. Les montants ITS et pension retenus par
-- bulletin sont donc SAISIS MANUELLEMENT par le comptable (aidé du barème déjà
-- affiché dans Paramètres fiscaux), pas calculés automatiquement par l'app.
-- Portée v1 volontairement limitée : pas d'avances sur salaire, pas de congés/
-- absences, pas de versionnage de salaire (comme products.price, une valeur
-- courante simple). RH reste par ailleurs hors périmètre (pas de paramétrage
-- fiscal RH au-delà de ce module).

insert into public.attributions (module, action_key, label) values
  ('paie', 'paie.gerer', 'Gérer les employés et les bulletins de paie'),
  ('paie', 'paie.consulter', 'Consulter les employés et les bulletins de paie');

-- Employés : écriture directe via RLS (comme chart_of_accounts), pas de RPC —
-- créer un employé ne génère aucune écriture comptable.
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  full_name text not null,
  position text,
  base_salary numeric(12, 2) not null default 0,
  family_dependents integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.employees enable row level security;

create policy employees_select on public.employees
  for select to authenticated
  using (company_id = public.current_company_id());

create policy employees_insert on public.employees
  for insert to authenticated
  with check (public.has_attribution('paie.gerer') and company_id = public.current_company_id());

create policy employees_update on public.employees
  for update to authenticated
  using (public.has_attribution('paie.gerer') and company_id = public.current_company_id())
  with check (public.has_attribution('paie.gerer') and company_id = public.current_company_id());

create trigger trg_audit_employees
  after insert or update or delete on public.employees
  for each row execute function public.fn_audit_log();

-- Plan comptable : charges de personnel + 3 comptes de tiers pour les retenues.
insert into public.chart_of_accounts (company_id, code, name)
select c.id, a.code, a.name
from public.companies c
cross join (
  values
    ('661', 'Rémunérations directes versées au personnel'),
    ('421', 'Personnel — rémunérations dues'),
    ('431', 'Sécurité sociale'),
    ('447', 'État — impôts retenus à la source')
) as a(code, name)
on conflict (company_id, code) do nothing;

-- Bulletins de paie : append-only comme les autres écritures financières
-- (transactions, journal_entries, purchase_losses...) — une correction se fait par
-- un nouveau bulletin, jamais en réécrivant l'historique.
create table public.payslips (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  employee_id uuid not null references public.employees (id),
  period date not null,
  gross_salary numeric(12, 2) not null check (gross_salary > 0),
  pension_withholding numeric(12, 2) not null default 0,
  its_withholding numeric(12, 2) not null default 0,
  net_pay numeric(12, 2) not null,
  user_id uuid not null references public.users (id),
  created_at timestamptz not null default now()
);

alter table public.payslips enable row level security;

create policy payslips_select on public.payslips
  for select to authenticated
  using (company_id = public.current_company_id());

create trigger trg_payslips_immutable
  before update or delete on public.payslips
  for each row execute function public.fn_block_mutation();

create trigger trg_audit_payslips
  after insert or update or delete on public.payslips
  for each row execute function public.fn_audit_log();

alter table public.journal_entries add column payslip_id uuid references public.payslips (id);
create index journal_entries_payslip_id_idx on public.journal_entries (payslip_id);

create or replace function public.create_payslip(payload jsonb)
returns payslips
language plpgsql security definer set search_path = 'public'
as $function$
declare
  v_caller_company uuid := public.current_company_id();
  v_employee public.employees;
  v_gross numeric(12, 2) := (payload ->> 'gross_salary')::numeric;
  v_pension numeric(12, 2) := coalesce((payload ->> 'pension_withholding')::numeric, 0);
  v_its numeric(12, 2) := coalesce((payload ->> 'its_withholding')::numeric, 0);
  v_net numeric(12, 2);
  v_payslip public.payslips;
  v_account_661 uuid;
  v_account_421 uuid;
  v_account_431 uuid;
  v_account_447 uuid;
  v_entry_id uuid;
begin
  if not public.has_attribution('paie.gerer') then
    raise exception 'Non autorisé à créer un bulletin de paie';
  end if;

  if v_caller_company is null then
    raise exception 'Aucune société associée à cet utilisateur';
  end if;

  select * into v_employee from public.employees
  where id = (payload ->> 'employee_id')::uuid and company_id = v_caller_company and active = true;
  if v_employee is null then
    raise exception 'Employé introuvable ou inactif pour cette société';
  end if;

  if v_gross is null or v_gross <= 0 then
    raise exception 'Le salaire brut doit être positif';
  end if;
  if v_pension < 0 or v_its < 0 then
    raise exception 'Les retenues ne peuvent pas être négatives';
  end if;
  if v_pension + v_its > v_gross then
    raise exception 'Le total des retenues ne peut pas dépasser le salaire brut';
  end if;

  v_net := v_gross - v_pension - v_its;

  insert into public.payslips (
    company_id, employee_id, period, gross_salary, pension_withholding, its_withholding, net_pay, user_id
  )
  values (
    v_caller_company, v_employee.id, (payload ->> 'period')::date, v_gross, v_pension, v_its, v_net, auth.uid()
  )
  returning * into v_payslip;

  select id into v_account_661 from public.chart_of_accounts where company_id = v_caller_company and code = '661';
  select id into v_account_421 from public.chart_of_accounts where company_id = v_caller_company and code = '421';
  select id into v_account_431 from public.chart_of_accounts where company_id = v_caller_company and code = '431';
  select id into v_account_447 from public.chart_of_accounts where company_id = v_caller_company and code = '447';
  if v_account_661 is null or v_account_421 is null or v_account_431 is null or v_account_447 is null then
    raise exception 'Plan comptable incomplet pour cette société (comptes 661/421/431/447 requis)';
  end if;

  insert into public.journal_entries (company_id, journal_code, description, payslip_id)
  values (v_caller_company, 'PAIE', 'Bulletin de paie — ' || v_employee.full_name, v_payslip.id)
  returning id into v_entry_id;

  insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
  values (v_entry_id, v_account_661, v_gross, 0);

  insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
  values (v_entry_id, v_account_421, 0, v_net);

  if v_pension > 0 then
    insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
    values (v_entry_id, v_account_431, 0, v_pension);
  end if;

  if v_its > 0 then
    insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
    values (v_entry_id, v_account_447, 0, v_its);
  end if;

  return v_payslip;
end;
$function$;

grant execute on function public.create_payslip(jsonb) to authenticated;
