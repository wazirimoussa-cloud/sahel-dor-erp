-- Suite de 0032 : un nouveau profil ne doit plus hériter d'un rôle par défaut
-- ('sales_operator') à sa création -- l'attribution des rôles est désormais optionnelle,
-- et un profil fraîchement créé ne doit avoir ni rôle ni attribution tant que
-- l'administrateur ne les a pas explicitement assignés.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, role_id)
  values (new.id, new.email, null);

  return new;
end;
$$;
