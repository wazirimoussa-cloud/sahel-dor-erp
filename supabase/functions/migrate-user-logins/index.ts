// OUTIL PONCTUEL -- migration des comptes non-admin existants vers l'identifiant/login
// (0072_identifiants_login.sql). Contrairement à create-user/reset-password/
// request-password-reset, ce n'est PAS un composant permanent de l'app : à supprimer
// (`supabase functions delete migrate-user-logins`) une fois l'exécution terminée sur
// Formation ET Production.
//
// Gated par un secret dédié (MIGRATION_SECRET), pas par une session utilisateur JWT :
// cette opération s'exécute avant même qu'un seul compte non-admin ne puisse se connecter
// par login, donc avant qu'aucune session admin "normale" ne puisse l'invoquer via le flux
// habituel (has_attribution côté appelant, comme create-user).
//
// Déploiement : `supabase functions deploy migrate-user-logins --no-verify-jwt`
//               `supabase secrets set MIGRATION_SECRET=<valeur aléatoire>`
// Appel : POST { companyId, dryRun? } avec l'en-tête X-Migration-Secret.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, LOGIN_EMAIL_DOMAIN } from "../_shared/constants.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MIGRATION_SECRET = Deno.env.get("MIGRATION_SECRET")!;

interface MigratePayload {
  companyId: string;
  dryRun?: boolean;
}

// Dérive un login depuis la partie locale de l'email actuel (ex. "gerant.formation" pour
// gerant.formation@saheldor.demo) -- normalisé au même format que la contrainte SQL
// users_login_format. Tronqué à 24 caractères (pas 30) pour réserver de la place à un
// éventuel suffixe numérique anti-collision (ci-dessous) sans jamais dépasser la limite
// de 30 caractères de la contrainte -- sans cette marge, une base déjà à 30 caractères
// suffixée devient invalide (observé : comptes "integration-archive-test-<timestamp>").
// Repli sur "user" si la partie locale ne laisse rien d'exploitable.
function deriveLoginBase(email: string): string {
  const local = email.split("@")[0] ?? email;
  const normalized = local
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/^[^a-z0-9]+/, "")
    .slice(0, 24)
    .replace(/[^a-z0-9]+$/, "");
  return normalized || "user";
}

Deno.serve(async (req) => {
  const headers = corsHeaders(req.headers.get("Origin"));
  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  if (req.headers.get("X-Migration-Secret") !== MIGRATION_SECRET) {
    return json({ error: "Non autorisé" }, 401);
  }

  const payload = (await req.json()) as MigratePayload;
  if (!payload.companyId) {
    return json({ error: "companyId requis" }, 400);
  }

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: candidates, error: fetchError } = await adminClient
    .from("users")
    .select("id, email, roles(name)")
    .eq("company_id", payload.companyId)
    .is("login", null);

  if (fetchError) {
    return json({ error: fetchError.message }, 400);
  }

  // Unicité GLOBALE (pas seulement dans cette société) -- voir 0072_identifiants_login.sql.
  const { data: existingLogins, error: loginsError } = await adminClient
    .from("users")
    .select("login")
    .not("login", "is", null);
  if (loginsError) {
    return json({ error: loginsError.message }, 400);
  }
  const takenLogins = new Set((existingLogins ?? []).map((r) => r.login as string));

  const migrated: { userId: string; oldEmail: string; newLogin: string }[] = [];
  const skipped: { userId: string; email: string; reason: string }[] = [];
  const errors: { userId: string; email: string; error: string }[] = [];

  for (const row of candidates ?? []) {
    const roleRelation = row.roles as { name: string } | { name: string }[] | null;
    const roleName = Array.isArray(roleRelation) ? roleRelation[0]?.name : roleRelation?.name;

    if (roleName === "admin") {
      skipped.push({ userId: row.id, email: row.email, reason: "rôle admin réel -- conservé sur email" });
      continue;
    }

    const base = deriveLoginBase(row.email);
    let login = base;
    let suffix = 0;
    while (takenLogins.has(login)) {
      suffix += 1;
      login = `${base}${suffix}`;
    }
    takenLogins.add(login);

    if (payload.dryRun) {
      migrated.push({ userId: row.id, oldEmail: row.email, newLogin: login });
      continue;
    }

    const syntheticEmail = `${login}@${LOGIN_EMAIL_DOMAIN}`;

    // API Admin officielle (pas de SQL brut sur auth.users) -- reste cohérent avec la
    // table identities interne de GoTrue, même principe que create-user.
    const { error: authError } = await adminClient.auth.admin.updateUserById(row.id, {
      email: syntheticEmail,
      email_confirm: true,
    });
    if (authError) {
      errors.push({ userId: row.id, email: row.email, error: authError.message });
      continue;
    }

    const { error: updateError } = await adminClient
      .from("users")
      .update({ login, email: syntheticEmail })
      .eq("id", row.id);
    if (updateError) {
      errors.push({ userId: row.id, email: row.email, error: updateError.message });
      continue;
    }

    migrated.push({ userId: row.id, oldEmail: row.email, newLogin: login });
  }

  return json({ dryRun: Boolean(payload.dryRun), migrated, skipped, errors }, 200);
});
