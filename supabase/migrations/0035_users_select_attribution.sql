-- Même correction que 0034, appliquée à la lecture de la liste des utilisateurs
-- (UsersPage) : qui gère les utilisateurs doit voir tous les profils de toutes les
-- sociétés, comme create-user/reset-password le permettent déjà, pas seulement si son
-- rôle porte encore littéralement le libellé 'admin'.

drop policy users_select on public.users;
create policy users_select on public.users
  for select to authenticated
  using (
    id = auth.uid()
    or public.current_role_name() = 'admin'
    or public.has_attribution('utilisateurs.gerer')
  );
