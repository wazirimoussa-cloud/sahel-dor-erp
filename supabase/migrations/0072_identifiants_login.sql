-- Identifiant (login) à la place de l'email pour tous les profils, sauf l'administrateur
-- réel (rôle littéral 'admin' -- un seul compte dans toute la base, voir README point 64).
-- Supabase Auth n'a pas de notion native de "login" -- signInWithPassword n'accepte que
-- email/phone. Chaque compte non-admin garde donc un email interne SYNTHÉTIQUE, jamais
-- affiché ni connu de l'utilisateur (<login>@login.saheldor.internal, voir
-- supabase/functions/_shared/constants.ts), et public.users.email reste synchronisé avec
-- cette valeur en permanence. Le login sert de point d'entrée public pour résoudre cet
-- email synthétique AVANT authentification (resolve_login_email ci-dessous).
--
-- Login volontairement unique GLOBALEMENT (pas par société) : la résolution se fait sans
-- connaître la société de l'utilisateur -- un login ambigu entre deux sociétés serait
-- impossible à résoudre à ce stade. Sans inconvénient pratique à l'échelle réelle (~40
-- comptes, 2 sociétés du même client).

alter table public.users add column login text;

alter table public.users add constraint users_login_format
  check (login is null or login ~ '^[a-z0-9](?:[a-z0-9._-]{1,28}[a-z0-9])?$');

alter table public.users add constraint users_login_unique unique (login);

-- Publique (appelée depuis l'écran de connexion, avant authentification) -- même profil
-- de risque que request-password-reset (accepté) : révèle uniquement si un login existe,
-- jamais de donnée sensible. login is null (comptes non migrés) ou active = false ne
-- résolvent jamais -- un compte désactivé ne doit pas pouvoir tenter une connexion.
create or replace function public.resolve_login_email(p_login text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select email from public.users
  where login = lower(trim(p_login)) and active = true
  limit 1;
$$;

grant execute on function public.resolve_login_email(text) to anon;
