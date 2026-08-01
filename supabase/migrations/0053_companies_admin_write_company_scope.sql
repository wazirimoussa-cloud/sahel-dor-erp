-- companies_admin_write (0050) est une policy `for all`, dont le `using` s'applique
-- aussi au SELECT -- sans filtre de société, elle donnait donc à quiconque détient
-- comptabilite.modifier_capital_social une lecture de TOUTES les sociétés (Formation
-- ET Production), pas seulement la sienne. Resté invisible jusqu'ici : aucun code
-- client ne lisait `companies` sans filtre explicite avant l'écran de paramètres TVA
-- (`useCompanySettings`, `.select(...).single()`, qui a immédiatement échoué avec
-- "The result contains 2 rows" -- exactement ce bug). Corrigé en ajoutant le filtre de
-- société déjà utilisé partout ailleurs, cohérent avec la suppression de la vue
-- cross-société de l'admin (0052) dans cette même phase.

drop policy if exists companies_admin_write on public.companies;

create policy companies_admin_write on public.companies
  for all
  using (has_attribution('comptabilite.modifier_capital_social') and id = current_company_id())
  with check (has_attribution('comptabilite.modifier_capital_social') and id = current_company_id());
