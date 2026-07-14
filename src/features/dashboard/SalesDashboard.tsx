import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/Card";
import { DashboardHeader } from "@/features/dashboard/DashboardHeader";

function useSalesDashboardData() {
  return useQuery({
    queryKey: ["dashboard-sales"],
    queryFn: async () => {
      const [pendingOrders, clients, unpaidOrders, recentOrders] = await Promise.all([
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("clients").select("id", { count: "exact", head: true }),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("payment_status", "unpaid"),
        supabase
          .from("orders")
          .select("id, status, payment_status, created_at, clients(name)")
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      return {
        pendingCount: pendingOrders.count ?? 0,
        clientsCount: clients.count ?? 0,
        unpaidCount: unpaidOrders.count ?? 0,
        recentOrders: recentOrders.data ?? [],
      };
    },
  });
}

const STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  validated: "Validée",
  cancelled: "Annulée",
};

// Opérateur de vente : ses commandes et l'état de leur validation/paiement — pas de
// vision financière ni de stock (hors de son périmètre RBAC).
export function SalesDashboard() {
  const { data, isLoading } = useSalesDashboardData();

  return (
    <div className="space-y-6">
      <DashboardHeader subtitle="Commandes et clients" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card accent="gold">
          <p className="text-xs uppercase text-gray-500">Commandes en attente</p>
          <p className="mt-1 text-2xl font-semibold text-gray-800">
            {isLoading ? "…" : data?.pendingCount}
          </p>
        </Card>
        <Card accent="red">
          <p className="text-xs uppercase text-gray-500">Commandes impayées</p>
          <p className="mt-1 text-2xl font-semibold text-gray-800">
            {isLoading ? "…" : data?.unpaidCount}
          </p>
        </Card>
        <Card accent="forest">
          <p className="text-xs uppercase text-gray-500">Clients</p>
          <p className="mt-1 text-2xl font-semibold text-gray-800">
            {isLoading ? "…" : data?.clientsCount}
          </p>
        </Card>
      </div>

      <Card>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-600">
          Commandes récentes
        </p>
        {isLoading ? (
          <p className="text-sm text-gray-500">Chargement…</p>
        ) : data && data.recentOrders.length > 0 ? (
          <ul className="space-y-2 text-sm text-gray-700">
            {data.recentOrders.map((o) => {
              const client = o.clients as { name: string } | { name: string }[] | null;
              const clientName = Array.isArray(client) ? client[0]?.name : client?.name;
              return (
                <li key={o.id} className="flex items-center justify-between border-b border-gray-100 pb-1">
                  <div>
                    <span>{clientName ?? "—"}</span>
                    <span className="ml-2 text-xs text-gray-400">
                      {new Date(o.created_at).toLocaleDateString("fr-FR")}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs uppercase text-gray-500">
                      {STATUS_LABELS[o.status] ?? o.status}
                    </span>
                    <Link to={`/orders/${o.id}`} className="text-brand-600 hover:underline">
                      Voir
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">Aucune commande pour le moment.</p>
        )}
      </Card>
    </div>
  );
}
