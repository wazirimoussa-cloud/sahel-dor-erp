import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { PurchaseStatus } from "@/lib/database.types";

export interface PurchasesReportFilters {
  dateFrom?: string;
  dateTo?: string;
  supplierId?: string;
  warehouseId?: string;
  status?: PurchaseStatus;
}

// Jeu de données complet (pas de pagination), pour extraction -- même esprit que
// fetchAllJournalEntries() dans JournalPage.tsx. usePurchases() (paginée, opérationnelle)
// n'est pas touchée par ce nouveau hook.
export function usePurchasesReport(filters: PurchasesReportFilters) {
  return useQuery({
    queryKey: ["reports", "purchases", filters],
    queryFn: async () => {
      let query = supabase
        .from("purchases")
        .select(
          "id, status, created_at, supplier_id, warehouse_id, suppliers(name), warehouses(name), companies(vat_rate, vat_reduced_rate), purchase_items(quantity, unit_cost, products(vat_exempt, vat_reduced))",
        );
      if (filters.dateFrom) query = query.gte("created_at", `${filters.dateFrom}T00:00:00.000`);
      if (filters.dateTo) query = query.lte("created_at", `${filters.dateTo}T23:59:59.999`);
      if (filters.supplierId) query = query.eq("supplier_id", filters.supplierId);
      if (filters.warehouseId) query = query.eq("warehouse_id", filters.warehouseId);
      if (filters.status) query = query.eq("status", filters.status);
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}
