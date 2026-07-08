import { Routes, Route } from "react-router-dom";
import { LoginPage } from "@/auth/LoginPage";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
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

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
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
          <ProtectedRoute allowedRoles={["admin", "manager", "seller"]}>
            <AppShell>
              <OrdersPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/orders/:id"
        element={
          <ProtectedRoute allowedRoles={["admin", "manager", "seller"]}>
            <AppShell>
              <OrderDetailPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/logs"
        element={
          <ProtectedRoute allowedRoles={["admin", "auditor"]}>
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
          <ProtectedRoute allowedRoles={["admin", "manager"]}>
            <AppShell>
              <WarehousesPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/suppliers"
        element={
          <ProtectedRoute allowedRoles={["admin", "manager"]}>
            <AppShell>
              <SuppliersPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/purchases"
        element={
          <ProtectedRoute allowedRoles={["admin", "manager"]}>
            <AppShell>
              <PurchasesPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/purchases/:id"
        element={
          <ProtectedRoute allowedRoles={["admin", "manager"]}>
            <AppShell>
              <PurchaseDetailPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
