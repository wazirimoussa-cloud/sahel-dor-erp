// Edge Function : "mot de passe oublié" — publique (appelée depuis l'écran de connexion,
// avant authentification). Réservée aux profils qui gèrent les utilisateurs
// (attribution utilisateurs.gerer, opérationnelle) : seul un email correspondant à un
// tel profil reçoit réellement un lien de récupération. La réponse est toujours le même
// message générique, que ce profil existe ou non avec cet email, pour ne jamais révéler
// qui a ce pouvoir par ce biais.
//
// redirectTo est validé contre une liste blanche (ALLOWED_ORIGINS, partagée avec le CORS
// des trois fonctions depuis l'audit sécurité du 2026-08-04) pour éviter tout détournement
// de redirection — corrige au passage le bug rencontré en session (lien de récupération
// pointant vers localhost:3000, faute de redirectTo explicite dans l'appel précédent).
//
// Déploiement : `npx supabase functions deploy request-password-reset --no-verify-jwt`
// (réutilise les secrets SUPABASE_SERVICE_ROLE_KEY/DEFAULT_PASSWORD déjà configurés
// pour create-user)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { ALLOWED_ORIGINS, corsHeaders } from "../_shared/constants.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Fenêtre glissante d'une heure : 3 demandes par email, 10 par adresse IP.
const WINDOW_MINUTES = 60;
const MAX_PER_EMAIL = 3;
const MAX_PER_IP = 10;

const GENERIC_MESSAGE =
  "Si ce compte peut réinitialiser son mot de passe par ce moyen, un lien vient d'être envoyé.";

interface RequestResetPayload {
  email: string;
  redirectTo: string;
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

  let payload: RequestResetPayload;
  try {
    payload = (await req.json()) as RequestResetPayload;
  } catch {
    return json({ error: "Corps de requête invalide" }, 400);
  }
  if (!payload.email || !payload.redirectTo) {
    return json({ error: "Champs manquants" }, 400);
  }

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Limite de débit (0105) : fonction publique, sans authentification. Compté par email ET
  // par IP, que le compte existe ou non -- la réponse reste donc identique pour un email
  // inconnu et ne révèle rien. Chaque tentative est comptée, y compris celles refusées.
  const emailKey = String(payload.email).trim().toLowerCase().slice(0, 254);
  const ip =
    req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();

  const [{ count: emailCount }, { count: ipCount }] = await Promise.all([
    adminClient
      .from("password_reset_attempts")
      .select("id", { count: "exact", head: true })
      .eq("email_key", emailKey)
      .gte("created_at", since),
    ip
      ? adminClient
          .from("password_reset_attempts")
          .select("id", { count: "exact", head: true })
          .eq("ip", ip)
          .gte("created_at", since)
      : Promise.resolve({ count: 0 }),
  ]);

  await adminClient.from("password_reset_attempts").insert({ email_key: emailKey, ip });
  // Purge opportuniste : la table ne sert qu'à la fenêtre glissante.
  await adminClient
    .from("password_reset_attempts")
    .delete()
    .lt("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  if ((emailCount ?? 0) >= MAX_PER_EMAIL || (ipCount ?? 0) >= MAX_PER_IP) {
    return json({ message: GENERIC_MESSAGE }, 429);
  }

  let redirectOrigin: string;
  try {
    redirectOrigin = new URL(payload.redirectTo).origin;
  } catch {
    return json({ message: GENERIC_MESSAGE }, 200);
  }

  if (!ALLOWED_ORIGINS.includes(redirectOrigin)) {
    return json({ message: GENERIC_MESSAGE }, 200);
  }

  // Réservé au rôle admin RÉEL (littéral 'admin' -- un seul compte dans toute la base,
  // voir README point 64), pas à l'attribution utilisateurs.gerer : depuis
  // l'identifiant/login (0072_identifiants_login.sql), tous les autres comptes -- même
  // ceux nommés "admin" (ex. admin@saheldor.demo) -- n'ont plus d'email réel, donc plus
  // aucune raison de recevoir un lien de réinitialisation par email.
  const { data: targetUser } = await adminClient
    .from("users")
    .select("roles(name)")
    .eq("email", payload.email)
    .maybeSingle();

  const roleRelation = targetUser?.roles as { name: string } | { name: string }[] | null;
  const roleName = Array.isArray(roleRelation) ? roleRelation[0]?.name : roleRelation?.name;
  const isRealAdmin = roleName === "admin";

  if (isRealAdmin) {
    await adminClient.auth.resetPasswordForEmail(payload.email, {
      redirectTo: payload.redirectTo,
    });
  }

  // Toujours la même réponse, que l'email corresponde à un admin ou non.
  return json({ message: GENERIC_MESSAGE }, 200);
});
