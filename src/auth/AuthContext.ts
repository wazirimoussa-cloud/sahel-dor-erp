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
  login: string | null;
  role: RoleName | null;
  companyId: string | null;
  companyName: string | null;
  mustChangePassword: boolean;
  active: boolean;
  attributions: Attribution[];
}

export interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  // Non vide juste après qu'une tentative de connexion a été refusée parce que le
  // compte est archivé (voir AuthProvider.bootstrap) -- à afficher sur /login, puis à
  // effacer via clearDeactivatedMessage une fois affiché.
  deactivatedMessage: string | null;
  clearDeactivatedMessage: () => void;
  signOut: () => Promise<void>;
  hasAttribution: (actionKey: string, minLevel?: AttributionLevel) => boolean;
  hasModuleAccess: (module: string) => boolean;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
