import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export function useProductStocks() {
  return useQuery({
    queryKey: ["product_stocks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_stocks")
        .select("id, stock, products(id, name), warehouses(name)")
        .order("stock", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}
