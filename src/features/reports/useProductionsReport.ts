import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface ProductionsReportFilters {
  dateFrom?: string;
  dateTo?: string;
  warehouseId?: string;
}

// Jeu de données complet (pas de pagination), pour extraction -- même esprit que
// fetchAllJournalEntries() dans JournalPage.tsx. useProductions() (paginée, opérationnelle)
// n'est pas touchée par ce nouveau hook.
export function useProductionsReport(filters: ProductionsReportFilters) {
  return useQuery({
    queryKey: ["reports", "productions", filters],
    queryFn: async () => {
      let query = supabase
        .from("productions")
        .select("id, created_at, warehouse_id, warehouses(name), production_items(quantity, unit_cost)");
      if (filters.dateFrom) query = query.gte("created_at", `${filters.dateFrom}T00:00:00.000`);
      if (filters.dateTo) query = query.lte("created_at", `${filters.dateTo}T23:59:59.999`);
      if (filters.warehouseId) query = query.eq("warehouse_id", filters.warehouseId);
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}
