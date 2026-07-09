import type { RoleName } from "@/lib/database.types";

export const ROLE_LABELS: Record<RoleName, string> = {
  admin: "Administrateur",
  warehouse_manager: "Gestionnaire de magasin",
  supervisor: "Superviseur",
  sales_operator: "Opérateur de vente",
  purchasing: "Responsable des achats",
  accounting: "Comptable",
  production_manager: "Responsable de production",
  controller: "Contrôleur",
  logistics_transport: "Logistique / Transport",
};
