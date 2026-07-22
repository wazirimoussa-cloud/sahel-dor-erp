import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
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
      "id, email, company_id, must_change_password, roles(name), user_attributions!user_attributions_user_id_fkey(level, attributions(module, action_key))",
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
    role: roleName ?? null,
    companyId: data.company_id,
    mustChangePassword: data.must_change_password,
    attributions,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function bootstrap(nextSession: Session | null) {
      setSession(nextSession);
      if (nextSession) {
        const nextProfile = await loadProfile(nextSession.user.id);
        if (active) setProfile(nextProfile);
      } else {
        setProfile(null);
      }
      if (active) setLoading(false);
    }

    supabase.auth.getSession().then(({ data }) => bootstrap(data.session));

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      bootstrap(nextSession);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
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
    <AuthContext.Provider value={{ session, profile, loading, signOut, hasAttribution, hasModuleAccess }}>
      {children}
    </AuthContext.Provider>
  );
}
