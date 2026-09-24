import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface StockLossesReportFilters {
  dateFrom?: string;
  dateTo?: string;
  warehouseId?: string;
  productId?: string;
  status?: string;
}

// Jeu de données complet (pas de pagination), pour extraction. useStockLossRequests()
// (paginée, opérationnelle) n'est pas touchée par ce nouveau hook.
export function useStockLossesReport(filters: StockLossesReportFilters) {
  return useQuery({
    queryKey: ["reports", "stock_losses", filters],
    queryFn: async () => {
      let query = supabase
        .from("stock_loss_requests")
        .select(
          "id, product_id, warehouse_id, quantity, repackaged_quantity, reason, status, created_at, products(name, unit), warehouses(name), requester:users!requested_by(email)",
        );
      if (filters.dateFrom) query = query.gte("created_at", `${filters.dateFrom}T00:00:00.000`);
      if (filters.dateTo) query = query.lte("created_at", `${filters.dateTo}T23:59:59.999`);
      if (filters.warehouseId) query = query.eq("warehouse_id", filters.warehouseId);
      if (filters.productId) query = query.eq("product_id", filters.productId);
      if (filters.status) query = query.eq("status", filters.status);
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}
