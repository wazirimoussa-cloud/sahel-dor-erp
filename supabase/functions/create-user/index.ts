// Edge Function : création de comptes utilisateurs par un admin.
// Le cahier des charges (section 4) ne décrit que la connexion, pas l'inscription — la
// création de compte est donc traitée comme une opération admin, jamais un self-signup
// ouvert. La clé service_role (seule capable de créer un utilisateur Auth + lui assigner
// un rôle/société) reste ici, côté serveur, et n'est jamais envoyée au frontend.
//
// Déploiement : `npx supabase functions deploy create-user`
//               `npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<clé service_role>`
//               `npx supabase secrets set DEFAULT_PASSWORD=<mot de passe par défaut>`

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { DEFAULT_PASSWORD, LOGIN_EMAIL_DOMAIN, LOGIN_FORMAT_REGEX, corsHeaders } from "../_shared/constants.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface CreateUserPayload {
  login: string;
  companyId: string;
}

Deno.serve(async (req) => {
  const headers = corsHeaders(req.headers.get("Origin"));
  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

  // Requête de préflight CORS envoyée par le navigateur avant tout POST cross-origin
  // avec en-têtes personnalisés (Authorization, Content-Type) — doit répondre 2xx.
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
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

  const { data: canManageUsers } = await callerClient.rpc("has_attribution", {
    p_action_key: "utilisateurs.gerer",
  });
  if (!canManageUsers) {
    return json({ error: "Réservé à la gestion des utilisateurs" }, 403);
  }

  const payload = (await req.json()) as CreateUserPayload;
  if (!payload.login || !payload.companyId) {
    return json({ error: "Champs manquants" }, 400);
  }

  // Identifiant à la place de l'email (0072_identifiants_login.sql) : normalisé puis
  // validé serveur (même règle que la contrainte SQL users_login_format) avant tout appel
  // Auth -- jamais confiance dans un format client, même si le formulaire valide déjà côté
  // frontend.
  const login = payload.login.trim().toLowerCase();
  if (!LOGIN_FORMAT_REGEX.test(login)) {
    return json({ error: "Identifiant invalide (3-30 caractères, minuscules/chiffres/points/tirets)" }, 400);
  }

  // Client admin : seule cette fonction détient la clé service_role.
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: existing } = await adminClient.from("users").select("id").eq("login", login).maybeSingle();
  if (existing) {
    return json({ error: "Cet identifiant est déjà utilisé" }, 409);
  }

  // Email synthétique jamais affiché -- seule ancre technique pour Supabase Auth, qui n'a
  // pas de notion native de "login" (signInWithPassword n'accepte que email/phone).
  const syntheticEmail = `${login}@${LOGIN_EMAIL_DOMAIN}`;

  // Mot de passe toujours le défaut partagé (jamais choisi par l'admin ni transmis par
  // le frontend) — must_change_password vaut true par défaut sur la nouvelle ligne
  // public.users (0013_password_policy.sql), donc le changement sera forcé à la
  // première connexion.
  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email: syntheticEmail,
    password: DEFAULT_PASSWORD,
    email_confirm: true,
  });

  if (createError || !created.user) {
    return json({ error: createError?.message ?? "Création impossible" }, 400);
  }

  // handle_new_user (trigger DB) a déjà créé la ligne public.users (avec l'email
  // synthétique, sans rôle ni attribution -- 0033_new_user_no_default_role.sql) ; on
  // renseigne ici la société et le login. L'attribution des opérations est une étape
  // séparée, faite ensuite par l'admin via set_user_attributions (voir
  // UserAttributionsPanel).
  const { error: updateError } = await adminClient
    .from("users")
    .update({ company_id: payload.companyId, login })
    .eq("id", created.user.id);

  if (updateError) {
    return json({ error: updateError.message }, 400);
  }

  return json({ id: created.user.id, login }, 201);
});
