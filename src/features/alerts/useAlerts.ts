import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

const LOW_STOCK_THRESHOLD = 5;

export function useAlerts() {
  return useQuery({
    queryKey: ["alerts"],
    queryFn: async () => {
      const [lowStock, pendingOrders, unpaidOrders] = await Promise.all([
        supabase
          .from("products")
          .select("id", { count: "exact", head: true })
          .lt("stock", LOW_STOCK_THRESHOLD),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("payment_status", "unpaid"),
      ]);

      return {
        lowStockCount: lowStock.count ?? 0,
        pendingOrdersCount: pendingOrders.count ?? 0,
        unpaidOrdersCount: unpaidOrders.count ?? 0,
      };
    },
    refetchInterval: 60_000,
  });
}
