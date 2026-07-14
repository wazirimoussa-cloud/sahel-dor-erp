import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { isLowStock } from "@/lib/stockThreshold";

export function useLowStockProducts() {
  return useQuery({
    queryKey: ["dashboard-low-stock-products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id, name, stock, unit");
      if (error) throw error;
      return (data ?? []).filter((p) => isLowStock(p.stock, p.unit));
    },
  });
}
