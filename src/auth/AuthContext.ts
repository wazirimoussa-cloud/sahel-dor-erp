import { createContext } from "react";
import type { Session } from "@supabase/supabase-js";
import type { RoleName } from "@/lib/database.types";

export interface Profile {
  id: string;
  email: string;
  role: RoleName;
  companyId: string | null;
  mustChangePassword: boolean;
}

export interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
