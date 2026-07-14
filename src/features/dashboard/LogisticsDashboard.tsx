import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/Card";
import { DashboardHeader } from "@/features/dashboard/DashboardHeader";

function useLogisticsDashboardData() {
  return useQuery({
    queryKey: ["dashboard-logistics"],
    queryFn: async () => {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const [lossesMonth, transporters, recentLosses] = await Promise.all([
        supabase
          .from("purchase_losses")
          .select("id", { count: "exact", head: true })
          .gte("created_at", startOfMonth.toISOString()),
        supabase.from("transporters").select("id", { count: "exact", head: true }),
        supabase
          .from("purchase_losses")
          .select("id, quantity_lost, unit_cost, created_at, purchase_id, products(name, unit), transporters(name)")
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      return {
        lossesMonthCount: lossesMonth.count ?? 0,
        transportersCount: transporters.count ?? 0,
        recentLosses: recentLosses.data ?? [],
      };
    },
  });
}

// Logistique / Transport : pertes constatées à la réception et transporteurs — pas de
// vision financière (l'écriture ACHATS reste sur la quantité commandée, hors périmètre
// de ce rôle, voir Phase 13).
export function LogisticsDashboard() {
  const { data, isLoading } = useLogisticsDashboardData();

  return (
    <div className="space-y-6">
      <DashboardHeader subtitle="Transport et pertes constatées" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card accent="red">
          <p className="text-xs uppercase text-gray-500">Pertes constatées ce mois</p>
          <p className="mt-1 text-2xl font-semibold text-gray-800">
            {isLoading ? "…" : data?.lossesMonthCount}
          </p>
        </Card>
        <Card accent="forest">
          <p className="text-xs uppercase text-gray-500">Transporteurs</p>
          <p className="mt-1 text-2xl font-semibold text-gray-800">
            {isLoading ? "…" : data?.transportersCount}
          </p>
        </Card>
      </div>

      <Card>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-600">
          Dernières pertes
        </p>
        {isLoading ? (
          <p className="text-sm text-gray-500">Chargement…</p>
        ) : data && data.recentLosses.length > 0 ? (
          <ul className="space-y-2 text-sm text-gray-700">
            {data.recentLosses.map((l) => {
              const product = l.products as { name: string; unit: string } | { name: string; unit: string }[] | null;
              const productInfo = Array.isArray(product) ? product[0] : product;
              const transporter = l.transporters as { name: string } | { name: string }[] | null;
              const transporterName = Array.isArray(transporter) ? transporter[0]?.name : transporter?.name;
              return (
                <li key={l.id} className="flex items-center justify-between border-b border-gray-100 pb-1">
                  <div>
                    <span>
                      {productInfo?.name ?? "—"} — {transporterName ?? "—"}
                    </span>
                    <span className="ml-2 text-xs text-gray-400">
                      {new Date(l.created_at).toLocaleDateString("fr-FR")}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-red-600">
                      {l.quantity_lost} {productInfo?.unit ?? ""}
                    </span>
                    <Link to={`/purchases/${l.purchase_id}`} className="text-brand-600 hover:underline">
                      Voir
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">Aucune perte constatée pour le moment.</p>
        )}
      </Card>
    </div>
  );
}
