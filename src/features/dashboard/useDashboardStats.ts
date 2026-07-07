import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

const LOW_STOCK_THRESHOLD = 5;

export function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [productsCount, lowStockCount, pendingOrdersCount, recentTransactions] = await Promise.all([
        supabase.from("products").select("id", { count: "exact", head: true }),
        supabase
          .from("products")
          .select("id", { count: "exact", head: true })
          .lt("stock", LOW_STOCK_THRESHOLD),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase
          .from("transactions")
          .select("id, type, quantity, created_at, products(name)")
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      return {
        productsCount: productsCount.count ?? 0,
        lowStockCount: lowStockCount.count ?? 0,
        pendingOrdersCount: pendingOrdersCount.count ?? 0,
        recentTransactions: recentTransactions.data ?? [],
      };
    },
  });
}
