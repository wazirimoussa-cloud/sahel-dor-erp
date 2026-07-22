import { Routes, Route } from "react-router-dom";
import { LoginPage } from "@/auth/LoginPage";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { ResetPasswordPage } from "@/auth/ResetPasswordPage";
import { ForcePasswordChangePage } from "@/auth/ForcePasswordChangePage";
import { AppShell } from "@/components/layout/AppShell";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { ProductsPage } from "@/features/products/ProductsPage";
import { StockPage } from "@/features/stock/StockPage";
import { OrdersPage } from "@/features/orders/OrdersPage";
import { OrderDetailPage } from "@/features/orders/OrderDetailPage";
import { LogsPage } from "@/features/logs/LogsPage";
import { UsersPage } from "@/features/users/UsersPage";
import { AccountPage } from "@/features/account/AccountPage";
import { WarehousesPage } from "@/features/warehouses/WarehousesPage";
import { SuppliersPage } from "@/features/suppliers/SuppliersPage";
import { PurchasesPage } from "@/features/purchases/PurchasesPage";
import { PurchaseDetailPage } from "@/features/purchases/PurchaseDetailPage";
import { PurchaseLossesPage } from "@/features/purchases/PurchaseLossesPage";
import { StockLossRequestsPage } from "@/features/stock-losses/StockLossRequestsPage";
import { TransportersPage } from "@/features/transporters/TransportersPage";
import { ProductionsPage } from "@/features/productions/ProductionsPage";
import { ProductionDetailPage } from "@/features/productions/ProductionDetailPage";
import { TransformationsPage } from "@/features/transformations/TransformationsPage";
import { TransformationDetailPage } from "@/features/transformations/TransformationDetailPage";
import { ClientsPage } from "@/features/clients/ClientsPage";
import { ChartOfAccountsPage } from "@/features/accounting/ChartOfAccountsPage";
import { JournalPage } from "@/features/accounting/JournalPage";
import { FinancialStatementsPage } from "@/features/financials/FinancialStatementsPage";
import { VatDeclarationPage } from "@/features/financials/VatDeclarationPage";

export function AppRoutes() {
  return (
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
    </Routes>
  );
}
