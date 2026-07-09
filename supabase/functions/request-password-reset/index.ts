// Edge Function : "mot de passe oublié" — publique (appelée depuis l'écran de connexion,
// avant authentification). Réservée aux comptes admin : seul un email appartenant à un
// compte de rôle admin reçoit réellement un lien de récupération. La réponse est
// toujours le même message générique, qu'un compte admin existe ou non avec cet email,
// pour ne jamais révéler qui est admin par ce biais.
//
// redirectTo est validé contre une liste blanche pour éviter tout détournement de
// redirection — corrige au passage le bug rencontré en session (lien de récupération
// pointant vers localhost:3000, faute de redirectTo explicite dans l'appel précédent).
//
// Déploiement : `npx supabase functions deploy request-password-reset --no-verify-jwt`
// (réutilise le secret SUPABASE_SERVICE_ROLE_KEY déjà configuré pour create-user)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ALLOWED_REDIRECT_ORIGINS = [
  "https://sahel-dor-erp.vercel.app",
  "https://sahel-dor-erp-formation.vercel.app",
  "http://localhost:5173",
  "http://localhost:5174",
];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GENERIC_MESSAGE =
  "Si un compte administrateur existe avec cet email, un lien de réinitialisation vient d'être envoyé.";

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

interface RequestResetPayload {
  email: string;
  redirectTo: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
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

  if (!ALLOWED_REDIRECT_ORIGINS.includes(redirectOrigin)) {
    return json({ message: GENERIC_MESSAGE }, 200);
  }

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: targetUser } = await adminClient
    .from("users")
    .select("roles(name)")
    .eq("email", payload.email)
    .maybeSingle();

  const roleRelation = targetUser?.roles as { name: string } | { name: string }[] | null;
  const roleName = Array.isArray(roleRelation) ? roleRelation[0]?.name : roleRelation?.name;

  if (roleName === "admin") {
    await adminClient.auth.resetPasswordForEmail(payload.email, {
      redirectTo: payload.redirectTo,
    });
  }

  // Toujours la même réponse, que l'email corresponde à un admin ou non.
  return json({ message: GENERIC_MESSAGE }, 200);
});
