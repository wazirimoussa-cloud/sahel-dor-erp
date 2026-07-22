import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { isLowStock } from "@/lib/stockThreshold";

export function useAlerts() {
  return useQuery({
    queryKey: ["alerts"],
    queryFn: async () => {
      const in30Days = new Date();
      in30Days.setDate(in30Days.getDate() + 30);
      const in30DaysIso = in30Days.toISOString().slice(0, 10);

      const [products, pendingOrders, unpaidOrders, expiringLots] = await Promise.all([
        supabase.from("products").select("stock, unit"),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("payment_status", "unpaid"),
        supabase
          .from("stock_lots")
          .select("id", { count: "exact", head: true })
          .gt("quantity_remaining", 0)
          .not("expiry_date", "is", null)
          .lte("expiry_date", in30DaysIso),
      ]);

      const lowStockCount = (products.data ?? []).filter((p) => isLowStock(p.stock, p.unit)).length;

      return {
        lowStockCount,
        pendingOrdersCount: pendingOrders.count ?? 0,
        unpaidOrdersCount: unpaidOrders.count ?? 0,
        expiringLotsCount: expiringLots.count ?? 0,
      };
    },
    refetchInterval: 60_000,
  });
}
