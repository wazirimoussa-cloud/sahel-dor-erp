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
          <ProtectedRoute
            allowedRoles={["admin", "controller", "sales_operator", "supervisor", "accounting"]}
          >
            <AppShell>
              <OrdersPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/orders/:id"
        element={
          <ProtectedRoute
            allowedRoles={["admin", "controller", "sales_operator", "supervisor", "accounting"]}
          >
            <AppShell>
              <OrderDetailPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/logs"
        element={
          <ProtectedRoute allowedRoles={["admin", "controller"]}>
            <AppShell>
              <LogsPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/users"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
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
          <ProtectedRoute allowedRoles={["admin", "controller", "warehouse_manager"]}>
            <AppShell>
              <WarehousesPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/suppliers"
        element={
          <ProtectedRoute allowedRoles={["admin", "controller", "purchasing"]}>
            <AppShell>
              <SuppliersPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/purchases"
        element={
          <ProtectedRoute allowedRoles={["admin", "controller", "purchasing", "warehouse_manager"]}>
            <AppShell>
              <PurchasesPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/purchases/:id"
        element={
          <ProtectedRoute allowedRoles={["admin", "controller", "purchasing", "warehouse_manager"]}>
            <AppShell>
              <PurchaseDetailPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/transporteurs"
        element={
          <ProtectedRoute
            allowedRoles={["admin", "controller", "warehouse_manager", "logistics_transport"]}
          >
            <AppShell>
              <TransportersPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/pertes-transport"
        element={
          <ProtectedRoute
            allowedRoles={["admin", "controller", "warehouse_manager", "logistics_transport"]}
          >
            <AppShell>
              <PurchaseLossesPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/pertes-stock"
        element={
          <ProtectedRoute
            allowedRoles={[
              "admin",
              "controller",
              "warehouse_manager",
              "production_manager",
              "logistics_transport",
            ]}
          >
            <AppShell>
              <StockLossRequestsPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/productions"
        element={
          <ProtectedRoute allowedRoles={["admin", "controller", "production_manager"]}>
            <AppShell>
              <ProductionsPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/productions/:id"
        element={
          <ProtectedRoute allowedRoles={["admin", "controller", "production_manager"]}>
            <AppShell>
              <ProductionDetailPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/transformations"
        element={
          <ProtectedRoute allowedRoles={["admin", "controller", "production_manager"]}>
            <AppShell>
              <TransformationsPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/transformations/:id"
        element={
          <ProtectedRoute allowedRoles={["admin", "controller", "production_manager"]}>
            <AppShell>
              <TransformationDetailPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/clients"
        element={
          <ProtectedRoute allowedRoles={["admin", "controller", "sales_operator"]}>
            <AppShell>
              <ClientsPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/chart-of-accounts"
        element={
          <ProtectedRoute allowedRoles={["admin", "controller", "accounting"]}>
            <AppShell>
              <ChartOfAccountsPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/journal-comptable"
        element={
          <ProtectedRoute allowedRoles={["admin", "controller", "accounting"]}>
            <AppShell>
              <JournalPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/etats-financiers"
        element={
          <ProtectedRoute allowedRoles={["admin", "controller", "accounting"]}>
            <AppShell>
              <FinancialStatementsPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/declaration-tva"
        element={
          <ProtectedRoute allowedRoles={["admin", "controller", "accounting"]}>
            <AppShell>
              <VatDeclarationPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
