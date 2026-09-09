import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

const TOP_N = 5;

export interface TopClient {
  clientId: string;
  name: string;
  total: number;
}

function relation<T>(value: T | T[] | null): T | undefined {
  return Array.isArray(value) ? value[0] : (value ?? undefined);
}

// Top clients par chiffre d'affaires sur la période -- commandes validées uniquement (le
// compte 701 n'est crédité qu'à la validation, voir 0011_accounting_entries.sql), agrégé
// côté client comme le reste des hooks de dashboard (useMonthlyActivity). Proxy du CA
// comptable, pas une ré-agrégation du journal -- cohérent avec le fait qu'aucune page de
// détail par client n'existe pour aller plus loin.
export function useTopClients(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ["dashboard-top-clients", startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("client_id, created_at, clients(name), order_items(quantity, unit_price)")
        .eq("status", "validated")
        .gte("created_at", `${startDate}T00:00:00.000`)
        .lte("created_at", `${endDate}T23:59:59.999`);
      if (error) throw error;

      const totals = new Map<string, TopClient>();
      for (const order of data ?? []) {
        const client = relation(order.clients);
        const orderTotal = (order.order_items ?? []).reduce(
          (sum, item) => sum + item.quantity * item.unit_price,
          0,
        );
        const existing = totals.get(order.client_id);
        if (existing) {
          existing.total += orderTotal;
        } else {
          totals.set(order.client_id, {
            clientId: order.client_id,
            name: client?.name ?? "—",
            total: orderTotal,
          });
        }
      }

      return [...totals.values()].sort((a, b) => b.total - a.total).slice(0, TOP_N);
    },
  });
}
