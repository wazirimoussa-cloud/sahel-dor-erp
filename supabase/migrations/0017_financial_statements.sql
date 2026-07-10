-- États financiers (Bilan, Compte de résultat, analyse financière) — Phase 10.
-- Aucune nouvelle table : le bilan/compte de résultat sont recalculés à la demande côté
-- client à partir de journal_entries/journal_entry_lines/chart_of_accounts/transactions/
-- purchases déjà en place (RLS déjà scopée société sur toutes ces tables, inchangée).
-- Seul ajout de schéma : le capital social, saisi manuellement une fois par le
-- Comptable, nécessaire pour distinguer Capital / Résultat cumulé au Passif du bilan.

alter table public.companies
  add column capital_social numeric(14, 2) not null default 0;

-- Seul le Comptable peut modifier le capital social (cohérent avec la règle Phase 9 :
-- l'admin reste strictement lecture seule, sauf gestion des comptes utilisateurs). La
-- policy companies_admin_write existante (0003) n'est exercée par aucune UI aujourd'hui
-- et reste inchangée, hors périmètre de cette passe.
create policy companies_accounting_update on public.companies
  for update to authenticated
  using (public.current_role_name() = 'accounting' and id = public.current_company_id())
  with check (public.current_role_name() = 'accounting' and id = public.current_company_id());
