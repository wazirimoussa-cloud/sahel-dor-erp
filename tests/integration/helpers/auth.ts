import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

// Connexion par identifiant (login), pas par email -- reproduit le vrai flux de
// LoginPage.tsx (0072_identifiants_login.sql) : résolution publique login -> email
// synthétique via resolve_login_email, PUIS signInWithPassword. Extrait en helper
// partagé (remplace 6 copies quasi identiques) au moment de ce changement, plutôt que de
// dupliquer la logique de résolution six fois.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

export const CREDENTIALS = {
  gerant: { login: process.env.TEST_GERANT_LOGIN, password: process.env.TEST_GERANT_PASSWORD },
  magasinier: { login: process.env.TEST_MAGASINIER_LOGIN, password: process.env.TEST_MAGASINIER_PASSWORD },
  superviseur: { login: process.env.TEST_SUPERVISEUR_LOGIN, password: process.env.TEST_SUPERVISEUR_PASSWORD },
  comptable: { login: process.env.TEST_COMPTABLE_LOGIN, password: process.env.TEST_COMPTABLE_PASSWORD },
  admin: { login: process.env.TEST_ADMIN_LOGIN, password: process.env.TEST_ADMIN_PASSWORD },
} as const;

export const hasCredentials =
  Boolean(SUPABASE_URL) &&
  Boolean(SUPABASE_ANON_KEY) &&
  Object.values(CREDENTIALS).every((c) => c.login && c.password);

if (!hasCredentials) {
  console.warn(
    "[integration] Comptes/URL Supabase absents de l'environnement -- suite ignorée. " +
      "Voir .env.example (TEST_GERANT_LOGIN, TEST_GERANT_PASSWORD, etc.).",
  );
}

export async function signInAs(role: keyof typeof CREDENTIALS): Promise<SupabaseClient<Database>> {
  const { login, password } = CREDENTIALS[role];
  const client = createClient<Database>(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: resolvedEmail, error: resolveError } = await client.rpc("resolve_login_email", {
    p_login: login as string,
  });
  if (resolveError || !resolvedEmail) {
    throw new Error(
      `Identifiant introuvable pour le profil ${role} (${login}) : ${resolveError?.message ?? "aucun compte actif avec cet identifiant"}`,
    );
  }

  const { error } = await client.auth.signInWithPassword({
    email: resolvedEmail,
    password: password as string,
  });
  if (error) {
    throw new Error(`Connexion échouée pour le profil ${role} (${login}) : ${error.message}`);
  }
  return client;
}
