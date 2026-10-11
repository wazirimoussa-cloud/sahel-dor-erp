-- Audit pré-lancement (2026-10-07), deux points restés ouverts sur les points d'entrée
-- appelables SANS connexion (README point 115).
--
-- 1) resolve_login_email (0072) supprimée : publique (grant anon), elle permettait à
--    n'importe qui de tester en masse si un identifiant existait ET était actif, sans
--    jamais toucher à Supabase Auth (donc sans ses limites de débit). L'email Auth d'un
--    compte non-admin étant déterministe (`<login>@login.saheldor.internal`),
--    LoginPage.tsx le calcule désormais localement (src/lib/loginEmail.ts) : un
--    identifiant inconnu échoue à signInWithPassword avec la même erreur qu'un mauvais
--    mot de passe. Un compte archivé peut s'authentifier mais n'obtient plus rien
--    (current_company_id() filtre active = true depuis 0048) et le frontend le déconnecte.
--
--    ORDRE DE DÉPLOIEMENT : le frontend (Vercel) qui n'appelle plus cette RPC doit être en
--    ligne AVANT `supabase db push`, sinon la connexion par identifiant casse entre les deux.
--
-- 2) Limite de débit pour request-password-reset (Edge Function publique) : jusqu'ici
--    seule la limite d'envoi d'emails de Supabase Auth s'appliquait, et uniquement quand
--    l'email était celui de l'admin réel -- chaque autre appel déclenchait une lecture
--    service_role sans aucun plafond. Compteur générique (edge_rate_limits) réutilisable
--    par d'autres fonctions publiques, accessible au seul service_role.

drop function if exists public.resolve_login_email(text);

create table public.edge_rate_limits (
  id bigint generated always as identity primary key,
  bucket text not null,
  created_at timestamptz not null default now()
);

create index edge_rate_limits_bucket_created_at_idx on public.edge_rate_limits (bucket, created_at);
create index edge_rate_limits_created_at_idx on public.edge_rate_limits (created_at);

-- RLS active sans aucune policy : aucune lecture/écriture possible via anon/authenticated,
-- seul service_role (qui contourne RLS) passe -- par consume_rate_limit uniquement.
alter table public.edge_rate_limits enable row level security;
revoke all on public.edge_rate_limits from anon, authenticated;

-- Enregistre une tentative dans `p_bucket` et renvoie false si `p_max` tentatives ont déjà
-- été enregistrées dans la fenêtre `p_window` (la tentative refusée n'est pas comptée).
-- Verrou consultatif par bucket : deux appels simultanés ne peuvent pas lire le même
-- compte et passer tous les deux. Purge au fil de l'eau (> 1 jour), table toujours petite.
create or replace function public.consume_rate_limit(p_bucket text, p_max integer, p_window interval)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('edge_rate_limits:' || p_bucket));

  delete from public.edge_rate_limits where created_at < now() - interval '1 day';

  select count(*) into v_count
  from public.edge_rate_limits
  where bucket = p_bucket and created_at > now() - p_window;

  if v_count >= p_max then
    return false;
  end if;

  insert into public.edge_rate_limits (bucket) values (p_bucket);
  return true;
end;
$$;

revoke execute on function public.consume_rate_limit(text, integer, interval) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, interval) to service_role;
