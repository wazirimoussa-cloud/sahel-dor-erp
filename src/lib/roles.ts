import type { RoleName } from "@/lib/database.types";

export const ROLE_LABELS: Record<RoleName, string> = {
  admin: "Administrateur",
  logistics: "Logistique",
  sales: "Commercial",
  accounting: "Comptable",
  controller: "Contrôleur",
  production_manager: "Gestionnaire de production",
};
