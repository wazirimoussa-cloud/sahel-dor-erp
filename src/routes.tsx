import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { LoginPage } from "@/auth/LoginPage";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { ResetPasswordPage } from "@/auth/ResetPasswordPage";
import { ForcePasswordChangePage } from "@/auth/ForcePasswordChangePage";
import { AppShell } from "@/components/layout/AppShell";

// Chargées à la demande par route (React.lazy) plutôt qu'au chargement initial : le
// chunk principal dépassait le seuil d'avertissement Vite (~600 kB) avec les 24 pages
// importées statiquement, alors qu'un profil donné n'en visite jamais qu'une poignée
// par session. LoginPage/ResetPasswordPage/ForcePasswordChangePage restent statiques :
// elles sont sur le chemin critique du tout premier chargement, quasi systématiquement
// nécessaires avant même qu'un profil et ses attributions ne soient connus.
const DashboardPage = lazy(() =>
  import("@/features/dashboard/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);
const ProductsPage = lazy(() =>
  import("@/features/products/ProductsPage").then((m) => ({ default: m.ProductsPage })),
);
const StockPage = lazy(() => import("@/features/stock/StockPage").then((m) => ({ default: m.StockPage })));
const OrdersPage = lazy(() => import("@/features/orders/OrdersPage").then((m) => ({ default: m.OrdersPage })));
const OrderDetailPage = lazy(() =>
  import("@/features/orders/OrderDetailPage").then((m) => ({ default: m.OrderDetailPage })),
);
const LogsPage = lazy(() => import("@/features/logs/LogsPage").then((m) => ({ default: m.LogsPage })));
const UsersPage = lazy(() => import("@/features/users/UsersPage").then((m) => ({ default: m.UsersPage })));
const AccountPage = lazy(() =>
  import("@/features/account/AccountPage").then((m) => ({ default: m.AccountPage })),
);
const WarehousesPage = lazy(() =>
  import("@/features/warehouses/WarehousesPage").then((m) => ({ default: m.WarehousesPage })),
);
const WarehouseDetailPage = lazy(() =>
  import("@/features/warehouses/WarehouseDetailPage").then((m) => ({ default: m.WarehouseDetailPage })),
);
const SuppliersPage = lazy(() =>
  import("@/features/suppliers/SuppliersPage").then((m) => ({ default: m.SuppliersPage })),
);
const PurchasesPage = lazy(() =>
  import("@/features/purchases/PurchasesPage").then((m) => ({ default: m.PurchasesPage })),
);
const PurchaseDetailPage = lazy(() =>
  import("@/features/purchases/PurchaseDetailPage").then((m) => ({ default: m.PurchaseDetailPage })),
);
const PurchaseLossesPage = lazy(() =>
  import("@/features/purchases/PurchaseLossesPage").then((m) => ({ default: m.PurchaseLossesPage })),
);
const StockLossRequestsPage = lazy(() =>
  import("@/features/stock-losses/StockLossRequestsPage").then((m) => ({
    default: m.StockLossRequestsPage,
  })),
);
const TransportersPage = lazy(() =>
  import("@/features/transporters/TransportersPage").then((m) => ({ default: m.TransportersPage })),
);
const ProductionsPage = lazy(() =>
  import("@/features/productions/ProductionsPage").then((m) => ({ default: m.ProductionsPage })),
);
const ProductionDetailPage = lazy(() =>
  import("@/features/productions/ProductionDetailPage").then((m) => ({
    default: m.ProductionDetailPage,
  })),
);
const TransformationsPage = lazy(() =>
  import("@/features/transformations/TransformationsPage").then((m) => ({
    default: m.TransformationsPage,
  })),
);
const TransformationDetailPage = lazy(() =>
  import("@/features/transformations/TransformationDetailPage").then((m) => ({
    default: m.TransformationDetailPage,
  })),
);
const ClientsPage = lazy(() =>
  import("@/features/clients/ClientsPage").then((m) => ({ default: m.ClientsPage })),
);
const ChartOfAccountsPage = lazy(() =>
  import("@/features/accounting/ChartOfAccountsPage").then((m) => ({ default: m.ChartOfAccountsPage })),
);
const JournalPage = lazy(() =>
  import("@/features/accounting/JournalPage").then((m) => ({ default: m.JournalPage })),
);
const FinancialStatementsPage = lazy(() =>
  import("@/features/financials/FinancialStatementsPage").then((m) => ({
    default: m.FinancialStatementsPage,
  })),
);
const VatDeclarationPage = lazy(() =>
  import("@/features/financials/VatDeclarationPage").then((m) => ({ default: m.VatDeclarationPage })),
);
const VatSettingsPage = lazy(() =>
  import("@/features/accounting/VatSettingsPage").then((m) => ({ default: m.VatSettingsPage })),
);
const EmployeesPage = lazy(() =>
  import("@/features/payroll/EmployeesPage").then((m) => ({ default: m.EmployeesPage })),
);
const PayePage = lazy(() => import("@/features/payroll/PayePage").then((m) => ({ default: m.PayePage })));

function RouteFallback() {
  return <div className="flex h-screen items-center justify-center text-gray-500">Chargement…</div>;
}

export function AppRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/force-password-change" element={<ForcePasswordChangePage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppShell>
                <DashboardPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/products"
          element={
            <ProtectedRoute>
              <AppShell>
                <ProductsPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/stock"
          element={
            <ProtectedRoute>
              <AppShell>
                <StockPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/orders"
          element={
            <ProtectedRoute requiredModule="ventes">
              <AppShell>
                <OrdersPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/orders/:id"
          element={
            <ProtectedRoute requiredModule="ventes">
              <AppShell>
                <OrderDetailPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/logs"
          element={
            <ProtectedRoute requiredModule="journal_audit">
              <AppShell>
                <LogsPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/users"
          element={
            <ProtectedRoute requiredModule="utilisateurs">
              <AppShell>
                <UsersPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/account"
          element={
            <ProtectedRoute>
              <AppShell>
                <AccountPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/warehouses"
          element={
            <ProtectedRoute requiredModule="entrepots">
              <AppShell>
                <WarehousesPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/warehouses/:id"
          element={
            <ProtectedRoute requiredModule="entrepots">
              <AppShell>
                <WarehouseDetailPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/suppliers"
          element={
            <ProtectedRoute requiredModule="fournisseurs">
              <AppShell>
                <SuppliersPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/purchases"
          element={
            <ProtectedRoute requiredModule="achats">
              <AppShell>
                <PurchasesPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/purchases/:id"
          element={
            <ProtectedRoute requiredModule="achats">
              <AppShell>
                <PurchaseDetailPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/transporteurs"
          element={
            <ProtectedRoute requiredModule="transporteurs">
              <AppShell>
                <TransportersPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/pertes-transport"
          element={
            <ProtectedRoute requiredModule="transporteurs">
              <AppShell>
                <PurchaseLossesPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/pertes-stock"
          element={
            <ProtectedRoute requiredModule="pertes_stock">
              <AppShell>
                <StockLossRequestsPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/productions"
          element={
            <ProtectedRoute requiredModule="production">
              <AppShell>
                <ProductionsPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/productions/:id"
          element={
            <ProtectedRoute requiredModule="production">
              <AppShell>
                <ProductionDetailPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/transformations"
          element={
            <ProtectedRoute requiredModule="transformation">
              <AppShell>
                <TransformationsPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/transformations/:id"
          element={
            <ProtectedRoute requiredModule="transformation">
              <AppShell>
                <TransformationDetailPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/clients"
          element={
            <ProtectedRoute requiredModule="clients">
              <AppShell>
                <ClientsPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/chart-of-accounts"
          element={
            <ProtectedRoute requiredModule="comptabilite">
              <AppShell>
                <ChartOfAccountsPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/journal-comptable"
          element={
            <ProtectedRoute requiredModule="journal_comptable">
              <AppShell>
                <JournalPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/etats-financiers"
          element={
            <ProtectedRoute requiredModule="etats_financiers">
              <AppShell>
                <FinancialStatementsPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/declaration-tva"
          element={
            <ProtectedRoute requiredModule="etats_financiers">
              <AppShell>
                <VatDeclarationPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/parametres-tva"
          element={
            <ProtectedRoute requiredModule="comptabilite">
              <AppShell>
                <VatSettingsPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/employes"
          element={
            <ProtectedRoute requiredModule="paie">
              <AppShell>
                <EmployeesPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/paie"
          element={
            <ProtectedRoute requiredModule="paie">
              <AppShell>
                <PayePage />
              </AppShell>
            </ProtectedRoute>
          }
        />
      </Routes>
    </Suspense>
  );
}
