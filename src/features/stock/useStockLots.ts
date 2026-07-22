import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export function useStockLots() {
  return useQuery({
    queryKey: ["stock_lots"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_lots")
        .select(
          "id, lot_number, quantity_remaining, unit_cost, expiry_date, created_at, products(name, unit), warehouses(name)",
        )
        .gt("quantity_remaining", 0)
        .order("expiry_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data;
    },
  });
}
