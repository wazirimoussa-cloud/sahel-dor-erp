-- Corrige une fuite de données inter-société : users_select et users_admin_write
-- (0049_users_admin_write_attribution.sql, 0052_retire_vue_admin_cross_societe.sql) ne
-- vérifient QUE has_attribution('utilisateurs.gerer'), jamais la société -- alors que
-- 0052 a justement rescopé toutes les AUTRES policies select de cette même migration
-- (transactions, transformations, transporters, warehouses...) sur company_id =
-- current_company_id(), son propre nom l'annonce ("retire vue admin cross-société").
-- users_select/users_admin_write ont été oubliées dans ce même passage : n'importe quel
-- compte avec utilisateurs.gerer (ex. l'Administrateur de Formation) pouvait lire ET
-- modifier (archiver/réactiver, must_change_password...) les comptes de TOUTE société,
-- Production incluse -- découvert en vérifiant la page Utilisateurs avec admin.formation
-- (17 comptes visibles au lieu des 5 de Formation).

drop policy if exists users_select on public.users;
create policy users_select on public.users
  for select to authenticated
  using (
    id = auth.uid()
    or (has_attribution('utilisateurs.gerer') and company_id = current_company_id())
  );

drop policy if exists users_admin_write on public.users;
create policy users_admin_write on public.users
  for update to authenticated
  using (has_attribution('utilisateurs.gerer') and company_id = current_company_id())
  with check (has_attribution('utilisateurs.gerer') and company_id = current_company_id());
