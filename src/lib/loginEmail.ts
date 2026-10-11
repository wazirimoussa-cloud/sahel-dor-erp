// Identifiant (login) -> email interne synthétique, calculé côté client depuis la
// migration 0105 (remplace la RPC publique resolve_login_email, qui permettait à
// n'importe qui, sans connexion, de tester si un identifiant existait et était actif).
//
// Possible parce que l'email Auth d'un compte non-admin est déterministe :
// `<login>@login.saheldor.internal`, posé par create-user et par la migration des
// comptes existants (README point 64). Un identifiant inconnu échoue donc à
// signInWithPassword avec la même erreur qu'un mauvais mot de passe — rien n'est révélé.
//
// Doit rester aligné avec supabase/functions/_shared/constants.ts (LOGIN_EMAIL_DOMAIN,
// LOGIN_FORMAT_REGEX) — runtime Deno séparé, d'où la duplication.
export const LOGIN_EMAIL_DOMAIN = "login.saheldor.internal";

export const LOGIN_FORMAT_REGEX = /^[a-z0-9](?:[a-z0-9._-]{1,28}[a-z0-9])?$/;

// null si l'identifiant ne peut correspondre à aucun compte (format invalide) : inutile
// d'appeler Supabase Auth dans ce cas.
export function loginToEmail(login: string): string | null {
  const normalized = login.trim().toLowerCase();
  return LOGIN_FORMAT_REGEX.test(normalized) ? `${normalized}@${LOGIN_EMAIL_DOMAIN}` : null;
}
