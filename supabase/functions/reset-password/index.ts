// Edge Function : réinitialisation d'un mot de passe utilisateur par un admin, à la
// valeur par défaut (voir _shared/constants.ts). L'utilisateur ciblé devra la changer
// dès sa prochaine connexion — must_change_password est explicitement repassé à true
// juste après le changement de mot de passe (le trigger sur auth.users, voir
// 0013_password_policy.sql, l'aurait sinon repassé à false comme pour tout changement
// de mot de passe réel).
//
// Déploiement : `npx supabase functions deploy reset-password`
// (réutilise le secret SUPABASE_SERVICE_ROLE_KEY déjà configuré pour create-user)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { DEFAULT_PASSWORD } from "../_shared/constants.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

interface ResetPasswordPayload {
  userId: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "Authentification requise" }, 401);
  }

  const callerClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user: caller },
  } = await callerClient.auth.getUser();

  if (!caller) {
    return json({ error: "Session invalide" }, 401);
  }

  const { data: callerRole } = await callerClient.rpc("current_role_name");
  if (callerRole !== "admin") {
    return json({ error: "Réservé aux administrateurs" }, 403);
  }

  const payload = (await req.json()) as ResetPasswordPayload;
  if (!payload.userId) {
    return json({ error: "Champs manquants" }, 400);
  }

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { error: updateAuthError } = await adminClient.auth.admin.updateUserById(payload.userId, {
    password: DEFAULT_PASSWORD,
  });

  if (updateAuthError) {
    return json({ error: updateAuthError.message }, 400);
  }

  // Repasse must_change_password à true : le trigger déclenché par le changement de mot
  // de passe ci-dessus vient de le repasser à false, il faut l'annuler explicitement.
  const { error: updateProfileError } = await adminClient
    .from("users")
    .update({ must_change_password: true })
    .eq("id", payload.userId);

  if (updateProfileError) {
    return json({ error: updateProfileError.message }, 400);
  }

  return json({ ok: true }, 200);
});
