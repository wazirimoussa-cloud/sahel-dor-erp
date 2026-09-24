import { lazy, Suspense, useMemo, useState } from "react";
import { useAuth } from "@/auth/useAuth";
import { Card } from "@/components/ui/Card";

const StockReport = lazy(() =>
  import("@/features/reports/StockReport").then((m) => ({ default: m.StockReport })),
);
const PurchasesReport = lazy(() =>
  import("@/features/reports/PurchasesReport").then((m) => ({ default: m.PurchasesReport })),
);
const OrdersReport = lazy(() =>
  import("@/features/reports/OrdersReport").then((m) => ({ default: m.OrdersReport })),
);
const StockLossesReport = lazy(() =>
  import("@/features/reports/StockLossesReport").then((m) => ({ default: m.StockLossesReport })),
);
const PurchaseLossesReport = lazy(() =>
  import("@/features/reports/PurchaseLossesReport").then((m) => ({ default: m.PurchaseLossesReport })),
);
const ProductionsReport = lazy(() =>
  import("@/features/reports/ProductionsReport").then((m) => ({ default: m.ProductionsReport })),
);
const TransformationsReport = lazy(() =>
  import("@/features/reports/TransformationsReport").then((m) => ({ default: m.TransformationsReport })),
);
const PayrollReport = lazy(() =>
  import("@/features/reports/PayrollReport").then((m) => ({ default: m.PayrollReport })),
);
const JournalReport = lazy(() =>
  import("@/features/reports/JournalReport").then((m) => ({ default: m.JournalReport })),
);
const UsersReport = lazy(() =>
  import("@/features/reports/UsersReport").then((m) => ({ default: m.UsersReport })),
);
const AuditLogReport = lazy(() =>
  import("@/features/reports/AuditLogReport").then((m) => ({ default: m.AuditLogReport })),
);

// Chaque état est gardé par le même module que sa page opérationnelle existante
// (routes.tsx) -- voir README, table de correspondance état -> garde-fou. La route /etats
// elle-même n'a aucun requiredModule (comme /stock) : un profil sans aucun des modules
// listés voit la page avec un message clair plutôt qu'un "Accès refusé".
interface ReportDefinition {
  key: string;
  label: string;
  visible: (ctx: { hasModuleAccess: (module: string) => boolean }) => boolean;
  Component: React.ComponentType;
}

const REPORTS: ReportDefinition[] = [
  { key: "stock", label: "Mouvements de stock", visible: () => true, Component: StockReport },
  {
    key: "purchases",
    label: "Achats",
    visible: ({ hasModuleAccess }) => hasModuleAccess("achats"),
    Component: PurchasesReport,
  },
  {
    key: "orders",
    label: "Ventes",
    visible: ({ hasModuleAccess }) => hasModuleAccess("ventes"),
    Component: OrdersReport,
  },
  {
    key: "stock-losses",
    label: "Pertes de stock",
    visible: ({ hasModuleAccess }) => hasModuleAccess("pertes_stock"),
    Component: StockLossesReport,
  },
  {
    key: "purchase-losses",
    label: "Pertes transport",
    visible: ({ hasModuleAccess }) => hasModuleAccess("transporteurs"),
    Component: PurchaseLossesReport,
  },
  {
    key: "productions",
    label: "Production",
    visible: ({ hasModuleAccess }) => hasModuleAccess("production"),
    Component: ProductionsReport,
  },
  {
    key: "transformations",
    label: "Transformation",
    visible: ({ hasModuleAccess }) => hasModuleAccess("transformation"),
    Component: TransformationsReport,
  },
  {
    key: "payroll",
    label: "Paie",
    visible: ({ hasModuleAccess }) => hasModuleAccess("paie"),
    Component: PayrollReport,
  },
  {
    key: "journal",
    label: "Journal comptable",
    visible: ({ hasModuleAccess }) => hasModuleAccess("journal_comptable"),
    Component: JournalReport,
  },
  {
    key: "users",
    label: "Utilisateurs",
    visible: ({ hasModuleAccess }) => hasModuleAccess("utilisateurs"),
    Component: UsersReport,
  },
  {
    key: "audit-log",
    label: "Journal d'audit",
    visible: ({ hasModuleAccess }) => hasModuleAccess("journal_audit"),
    Component: AuditLogReport,
  },
];

export function EtatsPage() {
  const { hasModuleAccess } = useAuth();
  const visibleReports = useMemo(
    () => REPORTS.filter((r) => r.visible({ hasModuleAccess })),
    [hasModuleAccess],
  );
  const [activeKey, setActiveKey] = useState<string | null>(visibleReports[0]?.key ?? null);
  const active = visibleReports.find((r) => r.key === activeKey) ?? visibleReports[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-forest-900">États</h1>
        <p className="mt-1 text-sm text-gray-500">
          Centre de rapports filtrables et exportables, regroupant les informations de
          l'ERP par domaine (période, magasin, produit, lot, statut, selon l'état). Chaque
          état affiché ci-dessous correspond exactement à ce que ton profil peut déjà
          consulter ailleurs dans l'application.
        </p>
      </div>

      {visibleReports.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-500">
            Aucun état accessible avec les droits actuels de ce profil.
          </p>
        </Card>
      ) : (
        <div className="flex flex-wrap gap-4 lg:flex-nowrap">
          <Card className="w-full shrink-0 lg:w-56">
            <nav className="flex flex-row flex-wrap gap-1 lg:flex-col">
              {visibleReports.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setActiveKey(r.key)}
                  className={`rounded-md px-3 py-2 text-left text-sm font-medium transition-colors ${
                    active?.key === r.key
                      ? "bg-forest-700 text-cream-50"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </nav>
          </Card>

          <div className="min-w-0 flex-1">
            <Suspense fallback={<p className="text-sm text-gray-500">Chargement…</p>}>
              {active && <active.Component />}
            </Suspense>
          </div>
        </div>
      )}
    </div>
  );
}
