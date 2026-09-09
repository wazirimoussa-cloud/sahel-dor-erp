import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

const TOP_N = 5;

export interface SalesByCreator {
  userId: string;
  email: string;
  total: number;
}

function relation<T>(value: T | T[] | null): T | undefined {
  return Array.isArray(value) ? value[0] : (value ?? undefined);
}

// Résumé de l'activité de vente sur une période -- commandes validées uniquement (même
// filtre que useTopClients.ts : le compte 701 n'est crédité qu'à la validation, voir
// 0011_accounting_entries.sql). Requête séparée de useTopClients volontairement, pour ne
// pas toucher à un hook déjà livré et vérifié pour le dashboard Finance.
export function useSalesPeriodSummary(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ["dashboard-sales-period-summary", startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("user_id, created_at, users(email), order_items(quantity, unit_price)")
        .eq("status", "validated")
        .gte("created_at", `${startDate}T00:00:00.000`)
        .lte("created_at", `${endDate}T23:59:59.999`);
      if (error) throw error;

      const orders = data ?? [];
      let totalCA = 0;
      const byCreator = new Map<string, SalesByCreator>();

      for (const order of orders) {
        const orderTotal = (order.order_items ?? []).reduce(
          (sum, item) => sum + item.quantity * item.unit_price,
          0,
        );
        totalCA += orderTotal;

        const creator = relation(order.users);
        const existing = byCreator.get(order.user_id);
        if (existing) {
          existing.total += orderTotal;
        } else {
          byCreator.set(order.user_id, {
            userId: order.user_id,
            email: creator?.email ?? "—",
            total: orderTotal,
          });
        }
      }

      const orderCount = orders.length;
      return {
        totalCA,
        orderCount,
        averageBasket: orderCount > 0 ? totalCA / orderCount : null,
        topCreators: [...byCreator.values()].sort((a, b) => b.total - a.total).slice(0, TOP_N),
      };
    },
  });
}
