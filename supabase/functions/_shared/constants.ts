// Mot de passe par défaut : utilisé à la création d'un compte par l'admin et lors d'une
// réinitialisation admin. Jamais transmis ni connu du frontend — uniquement manipulé
// côté serveur (clé service_role) par create-user et reset-password. Le changement est
// forcé dès la première connexion (voir must_change_password, 0013_password_policy.sql).
//
// Lu depuis un secret (jamais commité en dur) depuis l'audit sécurité du 2026-08-04 :
// un mot de passe partagé par tous les comptes visible dans l'historique git est un
// risque résiduel dès que l'accès au dépôt s'élargit au-delà de l'équipe de confiance.
// `npx supabase secrets set DEFAULT_PASSWORD=<valeur>` (voir .env.example).
export const DEFAULT_PASSWORD = Deno.env.get("DEFAULT_PASSWORD")!;

// Origines autorisées pour CORS et pour la redirection après réinitialisation de mot de
// passe (request-password-reset) — resserré depuis le "*" initial lors du même audit :
// la clé anon publique suffisait pour appeler ces fonctions depuis n'importe quel site,
// même si l'autorisation réelle (JWT + attribution) reste le vrai garde-fou.
export const ALLOWED_ORIGINS = [
  "https://sahel-dor-erp.vercel.app",
  "https://sahel-dor-erp-formation.vercel.app",
  "http://localhost:5173",
  "http://localhost:5174",
];

export function corsHeaders(origin: string | null): Record<string, string> {
  const allowOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}
