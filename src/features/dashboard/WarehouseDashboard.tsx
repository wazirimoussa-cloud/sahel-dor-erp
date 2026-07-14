import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/Card";
import { DashboardHeader } from "@/features/dashboard/DashboardHeader";
import { useLowStockProducts } from "@/features/dashboard/useLowStockProducts";

function useWarehouseStats() {
  return useQuery({
    queryKey: ["dashboard-warehouse-stats"],
    queryFn: async () => {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const [pendingPurchases, movementsToday] = await Promise.all([
        supabase.from("purchases").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase
          .from("transactions")
          .select("id", { count: "exact", head: true })
          .gte("created_at", startOfDay.toISOString()),
      ]);

      return {
        pendingPurchasesCount: pendingPurchases.count ?? 0,
        movementsTodayCount: movementsToday.count ?? 0,
      };
    },
  });
}

// Gestionnaire de magasin : ce qui touche au stock physique — niveaux bas, réceptions à
// faire, mouvements du jour. Pas de vision financière (hors de son périmètre RBAC).
export function WarehouseDashboard() {
  const { data: stats, isLoading: statsLoading } = useWarehouseStats();
  const { data: lowStockProducts, isLoading: alertsLoading } = useLowStockProducts();

  return (
    <div className="space-y-6">
      <DashboardHeader subtitle="Stock et réceptions" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card accent="red">
          <p className="text-xs uppercase text-gray-500">Produits en stock bas</p>
          <p className="mt-1 text-2xl font-semibold text-gray-800">
            {alertsLoading ? "…" : lowStockProducts?.length ?? 0}
          </p>
        </Card>
        <Card accent="gold">
          <p className="text-xs uppercase text-gray-500">Réceptions en attente</p>
          <p className="mt-1 text-2xl font-semibold text-gray-800">
            {statsLoading ? "…" : stats?.pendingPurchasesCount}
          </p>
        </Card>
        <Card accent="forest">
          <p className="text-xs uppercase text-gray-500">Mouvements aujourd'hui</p>
          <p className="mt-1 text-2xl font-semibold text-gray-800">
            {statsLoading ? "…" : stats?.movementsTodayCount}
          </p>
        </Card>
      </div>

      <Card>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-600">
          Alertes stock bas
        </p>
        {alertsLoading ? (
          <p className="text-sm text-gray-500">Chargement…</p>
        ) : lowStockProducts && lowStockProducts.length > 0 ? (
          <ul className="space-y-2 text-sm text-gray-700">
            {lowStockProducts.map((p) => (
              <li key={p.id} className="flex justify-between border-b border-gray-100 pb-1">
                <span>{p.name}</span>
                <span className="font-medium text-red-600">
                  {p.stock} {p.unit}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">Aucune alerte. Tous les niveaux sont sains.</p>
        )}
      </Card>
    </div>
  );
}
