import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { isLowStock } from "@/lib/stockThreshold";

export function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [productsCount, stockRows, pendingOrdersCount, recentTransactions] = await Promise.all([
        supabase.from("products").select("id", { count: "exact", head: true }),
        supabase.from("products").select("stock, unit"),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase
          .from("transactions")
          .select("id, type, quantity, created_at, products(name, unit)")
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      const lowStockCount = (stockRows.data ?? []).filter((p) => isLowStock(p.stock, p.unit)).length;

      return {
        productsCount: productsCount.count ?? 0,
        lowStockCount,
        pendingOrdersCount: pendingOrdersCount.count ?? 0,
        recentTransactions: recentTransactions.data ?? [],
      };
    },
  });
}
