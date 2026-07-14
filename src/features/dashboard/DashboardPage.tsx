import { useAuth } from "@/auth/useAuth";
import { FinancialDashboard } from "@/features/dashboard/FinancialDashboard";
import { WarehouseDashboard } from "@/features/dashboard/WarehouseDashboard";
import { PurchasingDashboard } from "@/features/dashboard/PurchasingDashboard";
import { SalesDashboard } from "@/features/dashboard/SalesDashboard";
import { SupervisorDashboard } from "@/features/dashboard/SupervisorDashboard";
import { ProductionDashboard } from "@/features/dashboard/ProductionDashboard";
import { LogisticsDashboard } from "@/features/dashboard/LogisticsDashboard";
import type { RoleName } from "@/lib/database.types";

// Chaque rôle a un tableau de bord adapté à son périmètre RBAC — un opérateur de vente
// n'a par exemple aucune raison de voir la trésorerie de la société, et un comptable n'a
// pas besoin d'une liste de commandes à valider.
const DASHBOARD_BY_ROLE: Record<RoleName, () => JSX.Element> = {
  admin: FinancialDashboard,
  controller: FinancialDashboard,
  accounting: FinancialDashboard,
  warehouse_manager: WarehouseDashboard,
  purchasing: PurchasingDashboard,
  sales_operator: SalesDashboard,
  supervisor: SupervisorDashboard,
  production_manager: ProductionDashboard,
  logistics_transport: LogisticsDashboard,
};

export function DashboardPage() {
  const { profile } = useAuth();

  if (!profile) {
    return <p className="text-sm text-gray-500">Chargement…</p>;
  }

  const RoleDashboard = DASHBOARD_BY_ROLE[profile.role] ?? FinancialDashboard;
  return <RoleDashboard />;
}
