// Identifiant (login) -> email interne synthétique, calculé côté navigateur.
//
// Tous les comptes non-admin ont un email Supabase Auth de la forme
// `<login>@login.saheldor.internal` (0072_identifiants_login.sql, migration des comptes
// existants décrite au point 64 du README, et create-user pour les nouveaux comptes).
// Le calcul est donc déterministe : plus besoin de demander à la base, avant toute
// connexion, si un identifiant existe (ancienne RPC publique resolve_login_email,
// fermée en 0106). Un identifiant inconnu et un mauvais mot de passe produisent
// désormais exactement la même réponse de Supabase Auth -- on ne peut plus dresser la
// liste des identifiants actifs depuis l'écran de connexion.
//
// Ces deux valeurs DOIVENT rester identiques à supabase/functions/_shared/constants.ts
// (les Edge Functions tournent sous Deno et ne peuvent pas importer src/) : un test
// unitaire (tests/unit/loginIdentity.test.ts) échoue si elles divergent.

export const LOGIN_EMAIL_DOMAIN = "login.saheldor.internal";

// Même règle que la contrainte SQL users_login_format (0072).
export const LOGIN_FORMAT_REGEX = /^[a-z0-9](?:[a-z0-9._-]{1,28}[a-z0-9])?$/;

/** Normalise un identifiant saisi (espaces, majuscules) comme le faisait resolve_login_email. */
export function normalizeLogin(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Email synthétique pour un identifiant valide, ou null si le format est impossible. */
export function loginToEmail(raw: string): string | null {
  const login = normalizeLogin(raw);
  return LOGIN_FORMAT_REGEX.test(login) ? `${login}@${LOGIN_EMAIL_DOMAIN}` : null;
}
