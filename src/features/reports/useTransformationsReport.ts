import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface TransformationsReportFilters {
  dateFrom?: string;
  dateTo?: string;
  warehouseId?: string;
}

// Jeu de données complet (pas de pagination), pour extraction. useTransformations()
// (paginée, opérationnelle) n'est pas touchée par ce nouveau hook.
export function useTransformationsReport(filters: TransformationsReportFilters) {
  return useQuery({
    queryKey: ["reports", "transformations", filters],
    queryFn: async () => {
      let query = supabase
        .from("transformations")
        .select(
          "id, created_at, warehouse_id, warehouses(name), transformation_inputs(quantity, products(unit)), transformation_outputs(quantity, products(unit))",
        );
      if (filters.dateFrom) query = query.gte("created_at", `${filters.dateFrom}T00:00:00.000`);
      if (filters.dateTo) query = query.lte("created_at", `${filters.dateTo}T23:59:59.999`);
      if (filters.warehouseId) query = query.eq("warehouse_id", filters.warehouseId);
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}
