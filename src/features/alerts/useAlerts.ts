import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { isLowStock } from "@/lib/stockThreshold";

export function useAlerts() {
  return useQuery({
    queryKey: ["alerts"],
    queryFn: async () => {
      const [products, pendingOrders, unpaidOrders] = await Promise.all([
        supabase.from("products").select("stock, unit"),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("payment_status", "unpaid"),
      ]);

      const lowStockCount = (products.data ?? []).filter((p) => isLowStock(p.stock, p.unit)).length;

      return {
        lowStockCount,
        pendingOrdersCount: pendingOrders.count ?? 0,
        unpaidOrdersCount: unpaidOrders.count ?? 0,
      };
    },
    refetchInterval: 60_000,
  });
}
