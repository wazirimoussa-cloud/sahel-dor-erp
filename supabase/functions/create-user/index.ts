// Edge Function : création de comptes utilisateurs par un admin.
// Le cahier des charges (section 4) ne décrit que la connexion, pas l'inscription — la
// création de compte est donc traitée comme une opération admin, jamais un self-signup
// ouvert. La clé service_role (seule capable de créer un utilisateur Auth + lui assigner
// un rôle/société) reste ici, côté serveur, et n'est jamais envoyée au frontend.
//
// Déploiement : `npx supabase functions deploy create-user`
//               `npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<clé service_role>`

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

interface CreateUserPayload {
  email: string;
  password: string;
  role: "admin" | "manager" | "seller" | "auditor";
  companyId: string;
}

Deno.serve(async (req) => {
  // Requête de préflight CORS envoyée par le navigateur avant tout POST cross-origin
  // avec en-têtes personnalisés (Authorization, Content-Type) — doit répondre 2xx.
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

  // Client "appelant" : n'utilise que le JWT reçu, soumis à la RLS normale.
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

  const payload = (await req.json()) as CreateUserPayload;
  if (!payload.email || !payload.password || !payload.role || !payload.companyId) {
    return json({ error: "Champs manquants" }, 400);
  }

  // Client admin : seule cette fonction détient la clé service_role.
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email: payload.email,
    password: payload.password,
    email_confirm: true,
  });

  if (createError || !created.user) {
    return json({ error: createError?.message ?? "Création impossible" }, 400);
  }

  const { data: role } = await adminClient
    .from("roles")
    .select("id")
    .eq("name", payload.role)
    .single();

  if (!role) {
    return json({ error: "Rôle inconnu" }, 400);
  }

  // handle_new_user (trigger DB) a déjà créé la ligne public.users avec le rôle par défaut ;
  // on la met à jour avec le rôle et la société réellement demandés.
  const { error: updateError } = await adminClient
    .from("users")
    .update({ role_id: role.id, company_id: payload.companyId })
    .eq("id", created.user.id);

  if (updateError) {
    return json({ error: updateError.message }, 400);
  }

  return json({ id: created.user.id, email: created.user.email }, 201);
});
