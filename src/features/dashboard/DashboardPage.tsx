import { useAuth } from "@/auth/useAuth";
import type { AttributionLevel } from "@/auth/AuthContext";
import { FinancialDashboard } from "@/features/dashboard/FinancialDashboard";
import { WarehouseDashboard } from "@/features/dashboard/WarehouseDashboard";
import { PurchasingDashboard } from "@/features/dashboard/PurchasingDashboard";
import { SalesDashboard } from "@/features/dashboard/SalesDashboard";
import { SupervisorDashboard } from "@/features/dashboard/SupervisorDashboard";
import { ProductionDashboard } from "@/features/dashboard/ProductionDashboard";
import { LogisticsDashboard } from "@/features/dashboard/LogisticsDashboard";

interface DashboardContext {
  hasModuleAccess: (module: string) => boolean;
  hasAttribution: (actionKey: string, minLevel?: AttributionLevel) => boolean;
}

// Chaque profil a un tableau de bord adapté à son périmètre d'attributions — un
// opérateur de vente n'a par exemple aucune raison de voir la trésorerie de la société,
// et un comptable n'a pas besoin d'une liste de commandes à valider. Comme un profil
// peut désormais cumuler des attributions inédites, le premier tableau de bord dont la
// condition correspond l'emporte — l'ordre ci-dessous va du plus spécifique au plus
// générique pour reproduire fidèlement l'ancien mapping par rôle fixe.
const DASHBOARD_PRIORITY: { match: (ctx: DashboardContext) => boolean; Component: () => JSX.Element }[] = [
  {
    match: ({ hasModuleAccess }) =>
      hasModuleAccess("comptabilite") || hasModuleAccess("etats_financiers") || hasModuleAccess("journal_comptable"),
    Component: FinancialDashboard,
  },
  {
    match: ({ hasModuleAccess, hasAttribution }) =>
      hasModuleAccess("entrepots") || hasAttribution("achats.receptionner"),
    Component: WarehouseDashboard,
  },
  { match: ({ hasModuleAccess }) => hasModuleAccess("achats"), Component: PurchasingDashboard },
  { match: ({ hasAttribution }) => hasAttribution("ventes.creer_commande"), Component: SalesDashboard },
  { match: ({ hasAttribution }) => hasAttribution("ventes.valider_commande"), Component: SupervisorDashboard },
  {
    match: ({ hasModuleAccess }) => hasModuleAccess("production") || hasModuleAccess("transformation"),
    Component: ProductionDashboard,
  },
  {
    match: ({ hasModuleAccess }) => hasModuleAccess("transporteurs") || hasModuleAccess("pertes_stock"),
    Component: LogisticsDashboard,
  },
];

function NoAttributionScreen() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
      <p className="text-sm font-semibold text-forest-900">Aucune attribution assignée</p>
      <p className="mt-1 text-sm text-gray-500">
        Votre profil n'a pas encore d'opération assignée. Contactez votre administrateur pour
        obtenir accès aux modules qui vous concernent.
      </p>
    </div>
  );
}

export function DashboardPage() {
  const { profile, hasModuleAccess, hasAttribution } = useAuth();

  if (!profile) {
    return <p className="text-sm text-gray-500">Chargement…</p>;
  }

  const match = DASHBOARD_PRIORITY.find((entry) => entry.match({ hasModuleAccess, hasAttribution }));
  const RoleDashboard = match?.Component ?? NoAttributionScreen;
  return <RoleDashboard />;
}
