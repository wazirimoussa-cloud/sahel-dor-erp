import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/Card";
import { DashboardHeader } from "@/features/dashboard/DashboardHeader";

function usePurchasingDashboardData() {
  return useQuery({
    queryKey: ["dashboard-purchasing"],
    queryFn: async () => {
      const [pendingPurchases, suppliers, recentPurchases] = await Promise.all([
        supabase.from("purchases").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("suppliers").select("id", { count: "exact", head: true }),
        supabase
          .from("purchases")
          .select("id, status, created_at, suppliers(name)")
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      return {
        pendingCount: pendingPurchases.count ?? 0,
        suppliersCount: suppliers.count ?? 0,
        recentPurchases: recentPurchases.data ?? [],
      };
    },
  });
}

const STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  received: "Reçu",
  cancelled: "Annulé",
};

// Responsable des achats : ce qu'il a créé et ce qui attend d'être réceptionné par le
// magasin — pas de vision financière ni de stock (hors de son périmètre RBAC).
export function PurchasingDashboard() {
  const { data, isLoading } = usePurchasingDashboardData();

  return (
    <div className="space-y-6">
      <DashboardHeader subtitle="Achats et fournisseurs" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card accent="gold">
          <p className="text-xs uppercase text-gray-500">Achats en attente de réception</p>
          <p className="mt-1 text-2xl font-semibold text-gray-800">
            {isLoading ? "…" : data?.pendingCount}
          </p>
        </Card>
        <Card accent="forest">
          <p className="text-xs uppercase text-gray-500">Fournisseurs</p>
          <p className="mt-1 text-2xl font-semibold text-gray-800">
            {isLoading ? "…" : data?.suppliersCount}
          </p>
        </Card>
      </div>

      <Card>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-600">
          Achats récents
        </p>
        {isLoading ? (
          <p className="text-sm text-gray-500">Chargement…</p>
        ) : data && data.recentPurchases.length > 0 ? (
          <ul className="space-y-2 text-sm text-gray-700">
            {data.recentPurchases.map((p) => {
              const supplier = p.suppliers as { name: string } | { name: string }[] | null;
              const supplierName = Array.isArray(supplier) ? supplier[0]?.name : supplier?.name;
              return (
                <li key={p.id} className="flex items-center justify-between border-b border-gray-100 pb-1">
                  <div>
                    <span>{supplierName ?? "—"}</span>
                    <span className="ml-2 text-xs text-gray-400">
                      {new Date(p.created_at).toLocaleDateString("fr-FR")}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs uppercase text-gray-500">
                      {STATUS_LABELS[p.status] ?? p.status}
                    </span>
                    <Link to={`/purchases/${p.id}`} className="text-brand-600 hover:underline">
                      Voir
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">Aucun achat pour le moment.</p>
        )}
      </Card>
    </div>
  );
}
