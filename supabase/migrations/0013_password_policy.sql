-- Politique de mot de passe : les nouveaux comptes (créés par l'admin, ou réinitialisés
-- par l'admin) démarrent avec le mot de passe par défaut (voir
-- supabase/functions/_shared/constants.ts) et doivent le changer avant tout accès au
-- reste de l'application. must_change_password default true : tout nouveau compte
-- l'a automatiquement sans code applicatif dédié ; les comptes déjà actifs (accès déjà
-- établi) sont backfillés à false ci-dessous.

alter table public.users add column must_change_password boolean not null default true;

update public.users set must_change_password = false;

-- Dès qu'un mot de passe change réellement (changement volontaire, lien de récupération
-- par email, ou réinitialisation admin), le flag repasse à false automatiquement — même
-- mécanique de trigger sur auth.users que handle_new_user (0002_functions_triggers.sql).
-- La réinitialisation admin (Edge Function reset-password) doit donc repasser le flag à
-- true explicitement juste après avoir changé le mot de passe, pour annuler cet effet.
create or replace function public.fn_clear_must_change_password()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users set must_change_password = false where id = new.id;
  return new;
end;
$$;

create trigger trg_clear_must_change_password
  after update of encrypted_password on auth.users
  for each row
  when (old.encrypted_password is distinct from new.encrypted_password)
  execute function public.fn_clear_must_change_password();
