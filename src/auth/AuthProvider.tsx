import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { RoleName } from "@/lib/database.types";
import { AuthContext, type Profile } from "@/auth/AuthContext";

async function loadProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("users")
    .select("id, email, company_id, must_change_password, roles(name)")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;

  const roleRelation = data.roles as { name: RoleName } | { name: RoleName }[] | null;
  const roleName = Array.isArray(roleRelation) ? roleRelation[0]?.name : roleRelation?.name;
  if (!roleName) return null;

  return {
    id: data.id,
    email: data.email,
    role: roleName,
    companyId: data.company_id,
    mustChangePassword: data.must_change_password,
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

  return (
    <AuthContext.Provider value={{ session, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
