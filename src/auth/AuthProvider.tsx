import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { setSentryUser, setSentryTag } from "@/lib/sentry";
import { supabase } from "@/lib/supabase";
import type { RoleName } from "@/lib/database.types";
import { AuthContext, type Attribution, type AttributionLevel, type Profile } from "@/auth/AuthContext";

interface RawAttributionRow {
  level: AttributionLevel;
  attributions:
    | { module: string; action_key: string }
    | { module: string; action_key: string }[]
    | null;
}

async function loadProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("users")
    .select(
      "id, email, login, company_id, must_change_password, active, roles(name), user_attributions!user_attributions_user_id_fkey(level, attributions(module, action_key))",
    )
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;

  const roleRelation = data.roles as { name: RoleName } | { name: RoleName }[] | null;
  const roleName = Array.isArray(roleRelation) ? roleRelation[0]?.name : roleRelation?.name;

  const rawAttributions = (data.user_attributions ?? []) as RawAttributionRow[];
  const attributions: Attribution[] = rawAttributions.flatMap((row) => {
    const rel = Array.isArray(row.attributions) ? row.attributions[0] : row.attributions;
    if (!rel) return [];
    return [{ module: rel.module, actionKey: rel.action_key, level: row.level }];
  });

  return {
    id: data.id,
    email: data.email,
    login: data.login,
    role: roleName ?? null,
    companyId: data.company_id,
    mustChangePassword: data.must_change_password,
    active: data.active,
    attributions,
  };
}

const DEACTIVATED_MESSAGE =
  "Ce compte a été désactivé. Contactez votre administrateur si vous pensez qu'il s'agit d'une erreur.";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [deactivatedMessage, setDeactivatedMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function bootstrap(nextSession: Session | null) {
      if (!nextSession) {
        if (mounted) {
          setSession(null);
          setProfile(null);
          setLoading(false);
        }
        setSentryUser(null);
        return;
      }

      const nextProfile = await loadProfile(nextSession.user.id);

      // Un compte archivé garde des identifiants valides (l'authentification Supabase
      // réussit) mais ne doit jamais obtenir de session utilisable dans l'app -- on le
      // déconnecte immédiatement plutôt que de le laisser voir des écrans vides faute
      // de données accessibles en RLS (voir 0048_archivage.sql, current_company_id()).
      if (nextProfile && !nextProfile.active) {
        await supabase.auth.signOut();
        if (mounted) {
          setSession(null);
          setProfile(null);
          setDeactivatedMessage(DEACTIVATED_MESSAGE);
          setLoading(false);
        }
        setSentryUser(null);
        return;
      }

      if (mounted) {
        setSession(nextSession);
        setProfile(nextProfile);
        setDeactivatedMessage(null);
        setLoading(false);
      }
      // Contexte utilisateur pour la triage des erreurs Sentry -- id/email seulement,
      // jamais de donnée métier sensible.
      if (nextProfile) {
        setSentryUser({ id: nextProfile.id, email: nextProfile.email });
        setSentryTag("company_id", nextProfile.companyId ?? "none");
      }
    }

    supabase.auth.getSession().then(({ data }) => bootstrap(data.session));

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      bootstrap(nextSession);
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
  }

  function clearDeactivatedMessage() {
    setDeactivatedMessage(null);
  }

  function hasAttribution(actionKey: string, minLevel: AttributionLevel = "operationnelle") {
    if (!profile) return false;
    return profile.attributions.some(
      (a) =>
        a.actionKey === actionKey &&
        (a.level === "operationnelle" || (minLevel === "consultative" && a.level === "consultative")),
    );
  }

  function hasModuleAccess(module: string) {
    if (!profile) return false;
    return profile.attributions.some((a) => a.module === module);
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        loading,
        deactivatedMessage,
        clearDeactivatedMessage,
        signOut,
        hasAttribution,
        hasModuleAccess,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
