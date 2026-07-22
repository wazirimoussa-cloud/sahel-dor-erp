import { createContext } from "react";
import type { Session } from "@supabase/supabase-js";
import type { RoleName } from "@/lib/database.types";

export type AttributionLevel = "operationnelle" | "consultative";

export interface Attribution {
  module: string;
  actionKey: string;
  level: AttributionLevel;
}

export interface Profile {
  id: string;
  email: string;
  role: RoleName | null;
  companyId: string | null;
  mustChangePassword: boolean;
  attributions: Attribution[];
}

export interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  hasAttribution: (actionKey: string, minLevel?: AttributionLevel) => boolean;
  hasModuleAccess: (module: string) => boolean;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
