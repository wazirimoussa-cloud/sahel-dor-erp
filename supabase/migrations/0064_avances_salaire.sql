-- Avances sur salaire, décisions confirmées avec l'utilisateur : versées depuis la
-- Banque de fonctionnement (522 — jusqu'ici une structure comptable sans aucun
-- mécanisme de dépense, limite documentée aux points 26-27 du README ; distincte de
-- la Banque d'opération 521, réservée aux encaissements clients, pour ne pas mélanger
-- flux commerciaux et dépenses RH), remboursées en une seule fois (pas d'étalement/
-- solde partiel) sur un bulletin de paie ultérieur du même employé.
--
-- Une avance est un fait financier immuable comme le reste (transactions,
-- journal_entries, payslips) : jamais modifiée après coup. Son statut "remboursée"
-- n'est jamais stocké/mis à jour sur la ligne elle-même -- il se déduit uniquement de
-- l'existence d'un payslips.advance_repaid_id qui la référence (évite toute UPDATE,
-- y compris via une RPC SECURITY DEFINER).

insert into public.chart_of_accounts (company_id, code, name)
select c.id, a.code, a.name
from public.companies c
cross join (
  values
    ('425', 'Personnel — avances et acomptes')
) as a(code, name)
on conflict (company_id, code) do nothing;

create table public.salary_advances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  employee_id uuid not null references public.employees (id),
  amount numeric(12, 2) not null check (amount > 0),
  advance_date date not null default current_date,
  reason text,
  user_id uuid not null references public.users (id),
  created_at timestamptz not null default now()
);

alter table public.salary_advances enable row level security;

create policy salary_advances_select on public.salary_advances
  for select to authenticated
  using (company_id = public.current_company_id());
-- pas de policy insert/update directe : écriture uniquement via create_salary_advance()

create trigger trg_salary_advances_immutable
  before update or delete on public.salary_advances
  for each row execute function public.fn_block_mutation();

create trigger trg_audit_salary_advances
  after insert or update or delete on public.salary_advances
  for each row execute function public.fn_audit_log();

alter table public.payslips add column advance_repaid_id uuid references public.salary_advances (id);
create index payslips_advance_repaid_id_idx on public.payslips (advance_repaid_id);

create or replace function public.create_salary_advance(payload jsonb)
returns salary_advances
language plpgsql security definer set search_path = 'public'
as $function$
declare
  v_caller_company uuid := public.current_company_id();
  v_employee public.employees;
  v_amount numeric(12, 2) := (payload ->> 'amount')::numeric;
  v_advance public.salary_advances;
  v_account_425 uuid;
  v_account_522 uuid;
  v_entry_id uuid;
begin
  if not public.has_attribution('paie.gerer') then
    raise exception 'Non autorisé à créer une avance sur salaire';
  end if;

  if v_caller_company is null then
    raise exception 'Aucune société associée à cet utilisateur';
  end if;

  select * into v_employee from public.employees
  where id = (payload ->> 'employee_id')::uuid and company_id = v_caller_company and active = true;
  if v_employee is null then
    raise exception 'Employé introuvable ou inactif pour cette société';
  end if;

  if v_amount is null or v_amount <= 0 then
    raise exception 'Le montant de l''avance doit être positif';
  end if;

  insert into public.salary_advances (company_id, employee_id, amount, advance_date, reason, user_id)
  values (
    v_caller_company, v_employee.id, v_amount,
    coalesce((payload ->> 'advance_date')::date, current_date),
    payload ->> 'reason', auth.uid()
  )
  returning * into v_advance;

  select id into v_account_425 from public.chart_of_accounts where company_id = v_caller_company and code = '425';
  select id into v_account_522 from public.chart_of_accounts where company_id = v_caller_company and code = '522';
  if v_account_425 is null or v_account_522 is null then
    raise exception 'Plan comptable incomplet pour cette société (comptes 425/522 requis)';
  end if;

  insert into public.journal_entries (company_id, journal_code, description)
  values (v_caller_company, 'PAIE', 'Avance sur salaire — ' || v_employee.full_name)
  returning id into v_entry_id;

  insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
  values (v_entry_id, v_account_425, v_amount, 0);
  insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
  values (v_entry_id, v_account_522, 0, v_amount);

  return v_advance;
end;
$function$;

grant execute on function public.create_salary_advance(jsonb) to authenticated;

-- create_payslip étendu : si payload contient 'advance_repaid_id', le net déduit
-- aussi le montant intégral de l'avance référencée (pas de solde partiel -- décision
-- confirmée) et l'écriture PAIE gagne une 5e ligne conditionnelle (crédit 425).
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
  v_advance_id uuid := (payload ->> 'advance_repaid_id')::uuid;
  v_advance public.salary_advances;
  v_advance_amount numeric(12, 2) := 0;
  v_net numeric(12, 2);
  v_payslip public.payslips;
  v_account_661 uuid;
  v_account_421 uuid;
  v_account_431 uuid;
  v_account_447 uuid;
  v_account_425 uuid;
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

  if v_advance_id is not null then
    select * into v_advance from public.salary_advances
    where id = v_advance_id and company_id = v_caller_company and employee_id = v_employee.id;
    if v_advance is null then
      raise exception 'Avance introuvable pour cet employé';
    end if;
    if exists (select 1 from public.payslips where advance_repaid_id = v_advance.id) then
      raise exception 'Cette avance a déjà été remboursée sur un autre bulletin';
    end if;
    v_advance_amount := v_advance.amount;
  end if;

  if v_pension + v_its + v_advance_amount > v_gross then
    raise exception 'Le total des retenues ne peut pas dépasser le salaire brut';
  end if;

  v_net := v_gross - v_pension - v_its - v_advance_amount;

  insert into public.payslips (
    company_id, employee_id, period, gross_salary, pension_withholding, its_withholding, net_pay,
    advance_repaid_id, user_id
  )
  values (
    v_caller_company, v_employee.id, (payload ->> 'period')::date, v_gross, v_pension, v_its, v_net,
    v_advance_id, auth.uid()
  )
  returning * into v_payslip;

  select id into v_account_661 from public.chart_of_accounts where company_id = v_caller_company and code = '661';
  select id into v_account_421 from public.chart_of_accounts where company_id = v_caller_company and code = '421';
  select id into v_account_431 from public.chart_of_accounts where company_id = v_caller_company and code = '431';
  select id into v_account_447 from public.chart_of_accounts where company_id = v_caller_company and code = '447';
  if v_account_661 is null or v_account_421 is null or v_account_431 is null or v_account_447 is null then
    raise exception 'Plan comptable incomplet pour cette société (comptes 661/421/431/447 requis)';
  end if;
  if v_advance_amount > 0 then
    select id into v_account_425 from public.chart_of_accounts where company_id = v_caller_company and code = '425';
    if v_account_425 is null then
      raise exception 'Plan comptable incomplet pour cette société (compte 425 requis)';
    end if;
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

  if v_advance_amount > 0 then
    insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
    values (v_entry_id, v_account_425, 0, v_advance_amount);
  end if;

  return v_payslip;
end;
$function$;
