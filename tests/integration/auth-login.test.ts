import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { hasCredentials, signInAs } from "./helpers/auth";

// Vérifie l'identifiant (login) à la place de l'email pour les profils non-admin
// (0072_identifiants_login.sql) contre Formation (RLS + attributions réelles, zéro mock) :
// résolution publique login -> email synthétique, et validation serveur de create-user.
//
// Ne couvre PAS request-password-reset (portée resserrée au rôle admin réel) : aucune
// façon d'observer, depuis l'API publique, si un email a réellement été envoyé sans le
// mot de passe du vrai compte admin (qu'on ne doit jamais manipuler dans un test
// automatisé) -- la réponse générique est délibérément opaque, par conception (voir le
// commentaire de la fonction). Vérifié par relecture de code, pas par ce fichier.
//
// Nécessite les comptes provisoires Formation -- voir .env.example. Suite ignorée
// (jamais en échec) si les identifiants sont absents.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

describe.skipIf(!hasCredentials)("identifiant (login) à la place de l'email (Formation, réel)", () => {
  it("resolve_login_email résout un identifiant actif connu vers son email synthétique", async () => {
    const anon = createClient<Database>(SUPABASE_URL as string, SUPABASE_ANON_KEY as string);
    const { data, error } = await anon.rpc("resolve_login_email", { p_login: "gerant.formation" });
    expect(error).toBeNull();
    expect(data).toBe("gerant.formation@login.saheldor.internal");
  });

  it("resolve_login_email renvoie null pour un identifiant inconnu", async () => {
    const anon = createClient<Database>(SUPABASE_URL as string, SUPABASE_ANON_KEY as string);
    const { data, error } = await anon.rpc("resolve_login_email", {
      p_login: `inconnu-${Date.now()}`,
    });
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it("create-user rejette un identifiant mal formé (majuscules, trop court)", async () => {
    const admin = await signInAs("admin");
    const { data: companyRow } = await admin
      .from("users")
      .select("company_id")
      .eq("login", "admin.formation")
      .single();

    const { error } = await admin.functions.invoke("create-user", {
      body: { login: "AB", companyId: companyRow!.company_id },
    });
    expect(error).not.toBeNull();
    await admin.auth.signOut();
  });

  it("create-user rejette un identifiant déjà utilisé", async () => {
    const admin = await signInAs("admin");
    const { data: companyRow } = await admin
      .from("users")
      .select("company_id")
      .eq("login", "admin.formation")
      .single();

    const { error } = await admin.functions.invoke("create-user", {
      body: { login: "gerant.formation", companyId: companyRow!.company_id },
    });
    expect(error).not.toBeNull();
    await admin.auth.signOut();
  });
});
