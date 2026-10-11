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
//
// Limite de débit (0105_durcissement_endpoints_publics.sql) : par IP et par email, via
// consume_rate_limit (service_role uniquement). Au-delà : 429, aucune lecture ni envoi.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { ALLOWED_ORIGINS, corsHeaders } from "../_shared/constants.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const GENERIC_MESSAGE =
  "Si ce compte peut réinitialiser son mot de passe par ce moyen, un lien vient d'être envoyé.";

// 10 demandes / 15 min par IP (un bureau partage souvent la même IP publique), 3 / heure
// par email : largement assez pour un oubli réel, inutilisable pour du martelage.
const IP_LIMIT = { max: 10, window: "15 minutes" };
const EMAIL_LIMIT = { max: 3, window: "1 hour" };

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

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

  const payload = (await req.json()) as RequestResetPayload;
  if (!payload.email || !payload.redirectTo) {
    return json({ error: "Champs manquants" }, 400);
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

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // IP client : premier élément de x-forwarded-for (posé par la passerelle Supabase).
  // Email haché : la table de comptage ne doit pas devenir un registre d'adresses.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "inconnue";
  const emailHash = await sha256Hex(payload.email.trim().toLowerCase());
  for (const [bucket, limit] of [
    [`request-password-reset:ip:${ip}`, IP_LIMIT],
    [`request-password-reset:email:${emailHash}`, EMAIL_LIMIT],
  ] as const) {
    const { data: allowed, error } = await adminClient.rpc("consume_rate_limit", {
      p_bucket: bucket,
      p_max: limit.max,
      p_window: limit.window,
    });
    // Échec du compteur lui-même : on refuse plutôt que de laisser passer sans plafond.
    if (error || allowed !== true) {
      return json({ error: "Trop de demandes. Réessayez plus tard." }, 429);
    }
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
