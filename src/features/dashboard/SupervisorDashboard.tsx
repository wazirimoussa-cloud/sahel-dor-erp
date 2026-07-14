import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/Card";
import { DashboardHeader } from "@/features/dashboard/DashboardHeader";

function useSupervisorDashboardData() {
  return useQuery({
    queryKey: ["dashboard-supervisor"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, created_at, clients(name), order_items(quantity, unit_price)")
        .eq("status", "pending")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

// Superviseur : les commandes qui attendent SA validation — c'est le seul rôle habilité
// à déclencher la sortie de stock + l'écriture comptable (voir validate_order).
export function SupervisorDashboard() {
  const { data: pendingOrders, isLoading } = useSupervisorDashboardData();

  const totalPendingValue = (pendingOrders ?? []).reduce((sum, o) => {
    const items = o.order_items as { quantity: number; unit_price: number }[];
    return sum + items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  }, 0);

  return (
    <div className="space-y-6">
      <DashboardHeader subtitle="Commandes en attente de validation" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card accent="gold">
          <p className="text-xs uppercase text-gray-500">Commandes à valider</p>
          <p className="mt-1 text-2xl font-semibold text-gray-800">
            {isLoading ? "…" : pendingOrders?.length ?? 0}
          </p>
        </Card>
        <Card accent="forest">
          <p className="text-xs uppercase text-gray-500">Montant total HT en attente</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-gray-800">
            {isLoading ? "…" : `${Math.round(totalPendingValue).toLocaleString("fr-FR")} FCFA`}
          </p>
        </Card>
      </div>

      <Card>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-600">
          À valider (les plus anciennes d'abord)
        </p>
        {isLoading ? (
          <p className="text-sm text-gray-500">Chargement…</p>
        ) : pendingOrders && pendingOrders.length > 0 ? (
          <ul className="space-y-2 text-sm text-gray-700">
            {pendingOrders.map((o) => {
              const client = o.clients as { name: string } | { name: string }[] | null;
              const clientName = Array.isArray(client) ? client[0]?.name : client?.name;
              const items = o.order_items as { quantity: number; unit_price: number }[];
              const total = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
              return (
                <li key={o.id} className="flex items-center justify-between border-b border-gray-100 pb-1">
                  <div>
                    <span>{clientName ?? "—"}</span>
                    <span className="ml-2 text-xs text-gray-400">
                      {new Date(o.created_at).toLocaleDateString("fr-FR")}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-gray-600">
                      {Math.round(total).toLocaleString("fr-FR")} FCFA
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
          <p className="text-sm text-gray-500">Aucune commande en attente de validation.</p>
        )}
      </Card>
    </div>
  );
}
