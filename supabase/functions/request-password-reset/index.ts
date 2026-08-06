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

  const { data: targetUser } = await adminClient
    .from("users")
    .select("id")
    .eq("email", payload.email)
    .maybeSingle();

  let canManageUsers = false;
  if (targetUser) {
    const { data: attributionRows } = await adminClient
      .from("user_attributions")
      .select("level, attributions!inner(action_key)")
      .eq("user_id", targetUser.id)
      .eq("attributions.action_key", "utilisateurs.gerer")
      .eq("level", "operationnelle");
    canManageUsers = (attributionRows?.length ?? 0) > 0;
  }

  if (canManageUsers) {
    await adminClient.auth.resetPasswordForEmail(payload.email, {
      redirectTo: payload.redirectTo,
    });
  }

  // Toujours la même réponse, que l'email corresponde à un admin ou non.
  return json({ message: GENERIC_MESSAGE }, 200);
});
