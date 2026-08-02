-- Congés/absences v1 : registre simple, décision confirmée avec l'utilisateur.
-- Contrairement aux taxes (CGI fourni et vérifié), il n'existe aucun texte de
-- référence pour les règles d'acquisition de congés payés (Code du Travail) — un
-- suivi de solde de congés acquis/pris aurait exigé d'inventer ces règles sur une
-- donnée qui affecte les droits réels des employés. Ce module reste donc un simple
-- registre (employé, type, dates, motif), sans calcul de solde et sans lien
-- automatique avec la paie : si une absence doit réduire un salaire, le comptable
-- ajuste manuellement le salaire brut du bulletin concerné, comme aujourd'hui.
--
-- Contrairement à payslips/salary_advances, un enregistrement de congé n'a aucun
-- impact comptable (aucune écriture générée) : il reste modifiable/supprimable
-- directement via RLS (comme employees), pas un fait financier immuable.

create type public.leave_type as enum ('conge_paye', 'maladie', 'absence_non_justifiee', 'autre');

create table public.leave_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  employee_id uuid not null references public.employees (id),
  type public.leave_type not null,
  start_date date not null,
  end_date date not null,
  reason text,
  user_id uuid not null references public.users (id),
  created_at timestamptz not null default now(),
  constraint leave_records_dates_check check (end_date >= start_date)
);

alter table public.leave_records enable row level security;

create policy leave_records_select on public.leave_records
  for select to authenticated
  using (company_id = public.current_company_id());

create policy leave_records_insert on public.leave_records
  for insert to authenticated
  with check (public.has_attribution('paie.gerer') and company_id = public.current_company_id());

create policy leave_records_update on public.leave_records
  for update to authenticated
  using (public.has_attribution('paie.gerer') and company_id = public.current_company_id())
  with check (public.has_attribution('paie.gerer') and company_id = public.current_company_id());

create policy leave_records_delete on public.leave_records
  for delete to authenticated
  using (public.has_attribution('paie.gerer') and company_id = public.current_company_id());

create trigger trg_audit_leave_records
  after insert or update or delete on public.leave_records
  for each row execute function public.fn_audit_log();
