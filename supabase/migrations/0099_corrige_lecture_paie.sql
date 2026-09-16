-- Corrige une fuite de données inter-attribution découverte lors de l'audit pré-lancement :
-- employees_select/payslips_select/salary_advances_select/leave_records_select
-- (0063_module_paie.sql, 0064_avances_salaire.sql, 0065_conges_absences.sql) ne
-- vérifiaient QUE la société, jamais une attribution --
-- contrairement à leurs policies insert/update, déjà correctement gardées par
-- has_attribution('paie.gerer'). N'importe quel employé connecté de la société, y
-- compris sans aucune attribution paie, pouvait donc lire le salaire exact de tous les
-- employés en interrogeant directement les tables (hors de l'écran Paie, pourtant fermé
-- côté client par requiredModule="paie").
--
-- paie.consulter existe depuis 0063 (seedé, proposé dans l'écran d'attribution, présent
-- dans provision-formation-auth.mjs) mais n'était référencé dans AUCUNE policy ni AUCUN
-- hasAttribution() côté frontend -- un droit purement décoratif jusqu'ici.
--
-- Choix : "paie.gerer" OU "paie.consulter" (niveau consultative suffit), pas seulement
-- paie.consulter seul -- EmployeesPage.tsx/PayePage.tsx chargent déjà la liste sans
-- condition sur canManage (seuls les boutons d'action le sont), donc un compte n'ayant
-- que paie.gerer doit continuer à voir la liste pour pouvoir la gérer, exactement comme
-- avant cette correction. Aucun changement frontend requis : le module paie est déjà
-- gardé en amont par requiredModule="paie" (hasModuleAccess, vrai dès qu'une attribution
-- paie.* existe), cette migration ne fait que faire enfin respecter la même règle par la
-- base de données elle-même plutôt que de ne compter que sur l'UI.

drop policy if exists employees_select on public.employees;
create policy employees_select on public.employees
  for select to authenticated
  using (
    company_id = public.current_company_id()
    and (public.has_attribution('paie.gerer') or public.has_attribution('paie.consulter', 'consultative'))
  );

drop policy if exists payslips_select on public.payslips;
create policy payslips_select on public.payslips
  for select to authenticated
  using (
    company_id = public.current_company_id()
    and (public.has_attribution('paie.gerer') or public.has_attribution('paie.consulter', 'consultative'))
  );

drop policy if exists salary_advances_select on public.salary_advances;
create policy salary_advances_select on public.salary_advances
  for select to authenticated
  using (
    company_id = public.current_company_id()
    and (public.has_attribution('paie.gerer') or public.has_attribution('paie.consulter', 'consultative'))
  );

drop policy if exists leave_records_select on public.leave_records;
create policy leave_records_select on public.leave_records
  for select to authenticated
  using (
    company_id = public.current_company_id()
    and (public.has_attribution('paie.gerer') or public.has_attribution('paie.consulter', 'consultative'))
  );
