-- Limite de débit de l'Edge Function publique request-password-reset (audit pré-lancement,
-- 2026-10-07) : fonction appelable sans authentification, donc sans aucune limite elle
-- pouvait être martelée (envoi en rafale de liens de récupération, saturation du quota
-- d'emails Supabase Auth). Les tentatives sont comptées par email ET par adresse IP sur
-- une fenêtre glissante, dans cette table, lue/écrite uniquement par la fonction avec la
-- clé service_role.
--
-- RLS activée SANS aucune policy, volontairement : aucun accès pour anon/authenticated
-- (le conseiller Supabase signalera "RLS enabled, no policy" -- c'est le comportement
-- recherché, pas un oubli). Pas de company_id : la fonction est publique, appelée avant
-- toute authentification, la requête ne concerne aucune société. Pas d'immutabilité
-- (contrairement au grand livre) : lignes purgées par la fonction après 24 h.

create table public.password_reset_attempts (
  id uuid primary key default gen_random_uuid(),
  email_key text not null,
  ip text,
  created_at timestamptz not null default now()
);

create index password_reset_attempts_email_idx
  on public.password_reset_attempts (email_key, created_at desc);
create index password_reset_attempts_ip_idx
  on public.password_reset_attempts (ip, created_at desc);

alter table public.password_reset_attempts enable row level security;

revoke all on public.password_reset_attempts from anon, authenticated;
