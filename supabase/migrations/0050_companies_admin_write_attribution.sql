-- Même défaut que users_admin_write (0049_users_admin_write_attribution.sql) : la
-- policy companies_admin_write ne vérifiait que le rôle littéral 'admin', jamais migré
-- vers une attribution depuis 0032_attributions.sql, et sans aucun filet de secours
-- (contrairement aux ~25 autres policies qui gardent un OR company_id =
-- current_company_id() pour l'accès normal -- voir README, "Limites connues", point
-- sur la vue cross-société de l'admin). Aujourd'hui inutilisée par le code client
-- (aucun formulaire n'écrit sur `companies`), donc pas un bug actif -- corrigée par
-- anticipation avant qu'un écran "Modifier le capital social"/"Taux de TVA" ne
-- l'active et tombe dans le même piège que users_admin_write.
drop policy if exists companies_admin_write on public.companies;

create policy companies_admin_write on public.companies
  for all
  using (has_attribution('comptabilite.modifier_capital_social'))
  with check (has_attribution('comptabilite.modifier_capital_social'));
