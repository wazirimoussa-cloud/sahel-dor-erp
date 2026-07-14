import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/Card";
import { DashboardHeader } from "@/features/dashboard/DashboardHeader";
import { useLowStockProducts } from "@/features/dashboard/useLowStockProducts";

function useProductionDashboardData() {
  return useQuery({
    queryKey: ["dashboard-production"],
    queryFn: async () => {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const [productionsMonth, transformationsMonth, recentProductions, recentTransformations] =
        await Promise.all([
          supabase
            .from("productions")
            .select("id", { count: "exact", head: true })
            .gte("created_at", startOfMonth.toISOString()),
          supabase
            .from("transformations")
            .select("id", { count: "exact", head: true })
            .gte("created_at", startOfMonth.toISOString()),
          supabase
            .from("productions")
            .select("id, created_at, warehouses(name)")
            .order("created_at", { ascending: false })
            .limit(4),
          supabase
            .from("transformations")
            .select("id, created_at, warehouses(name)")
            .order("created_at", { ascending: false })
            .limit(4),
        ]);

      return {
        productionsMonthCount: productionsMonth.count ?? 0,
        transformationsMonthCount: transformationsMonth.count ?? 0,
        recentProductions: recentProductions.data ?? [],
        recentTransformations: recentTransformations.data ?? [],
      };
    },
  });
}

function warehouseName(w: { name: string } | { name: string }[] | null) {
  return Array.isArray(w) ? w[0]?.name : w?.name;
}

// Responsable de production : activité de production/transformation du mois, et les
// matières premières en stock bas (bloquantes pour produire) — pas de vision financière.
export function ProductionDashboard() {
  const { data, isLoading } = useProductionDashboardData();
  const { data: lowStockProducts, isLoading: alertsLoading } = useLowStockProducts();

  return (
    <div className="space-y-6">
      <DashboardHeader subtitle="Production et transformation" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card accent="forest">
          <p className="text-xs uppercase text-gray-500">Productions ce mois</p>
          <p className="mt-1 text-2xl font-semibold text-gray-800">
            {isLoading ? "…" : data?.productionsMonthCount}
          </p>
        </Card>
        <Card accent="gold">
          <p className="text-xs uppercase text-gray-500">Transformations ce mois</p>
          <p className="mt-1 text-2xl font-semibold text-gray-800">
            {isLoading ? "…" : data?.transformationsMonthCount}
          </p>
        </Card>
        <Card accent="red">
          <p className="text-xs uppercase text-gray-500">Produits en stock bas</p>
          <p className="mt-1 text-2xl font-semibold text-gray-800">
            {alertsLoading ? "…" : lowStockProducts?.length ?? 0}
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-600">
            Dernières productions
          </p>
          {isLoading ? (
            <p className="text-sm text-gray-500">Chargement…</p>
          ) : data && data.recentProductions.length > 0 ? (
            <ul className="space-y-2 text-sm text-gray-700">
              {data.recentProductions.map((p) => (
                <li key={p.id} className="flex items-center justify-between border-b border-gray-100 pb-1">
                  <div>
                    <span>{warehouseName(p.warehouses) ?? "—"}</span>
                    <span className="ml-2 text-xs text-gray-400">
                      {new Date(p.created_at).toLocaleDateString("fr-FR")}
                    </span>
                  </div>
                  <Link to={`/productions/${p.id}`} className="text-brand-600 hover:underline">
                    Voir
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">Aucune production pour le moment.</p>
          )}
        </Card>

        <Card>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-600">
            Dernières transformations
          </p>
          {isLoading ? (
            <p className="text-sm text-gray-500">Chargement…</p>
          ) : data && data.recentTransformations.length > 0 ? (
            <ul className="space-y-2 text-sm text-gray-700">
              {data.recentTransformations.map((t) => (
                <li key={t.id} className="flex items-center justify-between border-b border-gray-100 pb-1">
                  <div>
                    <span>{warehouseName(t.warehouses) ?? "—"}</span>
                    <span className="ml-2 text-xs text-gray-400">
                      {new Date(t.created_at).toLocaleDateString("fr-FR")}
                    </span>
                  </div>
                  <Link to={`/transformations/${t.id}`} className="text-brand-600 hover:underline">
                    Voir
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">Aucune transformation pour le moment.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
