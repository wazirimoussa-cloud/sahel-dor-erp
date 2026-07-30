import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { TransactionType } from "@/lib/database.types";

export interface WarehouseHistoryFilters {
  productId?: string;
  type?: TransactionType;
  from?: string;
  to?: string;
}

// Historique filtré côté serveur (pas de plafond fixe côté client comme sur /stock) :
// une recherche doit pouvoir retrouver un mouvement ancien, pas seulement les 50
// derniers. Le plafond de 300 reste une limite assumée, documentée dans le README.
export function useWarehouseTransactions(
  warehouseId: string | undefined,
  filters: WarehouseHistoryFilters,
) {
  return useQuery({
    queryKey: ["warehouse_transactions", warehouseId, filters],
    enabled: Boolean(warehouseId),
    queryFn: async () => {
      let query = supabase
        .from("transactions")
        .select("id, type, quantity, unit_cost, expiry_date, note, created_at, products(id, name, unit)")
        .eq("warehouse_id", warehouseId as string)
        .order("created_at", { ascending: false })
        .limit(300);

      if (filters.productId) query = query.eq("product_id", filters.productId);
      if (filters.type) query = query.eq("type", filters.type);
      if (filters.from) query = query.gte("created_at", `${filters.from}T00:00:00.000`);
      if (filters.to) query = query.lte("created_at", `${filters.to}T23:59:59.999`);

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

// Historique complet des lots de ce magasin -- contrairement à la section "Lots" de
// /stock (qui ne montre que le stock disponible aujourd'hui), inclut aussi les lots
// déjà entièrement consommés (quantity_remaining = 0), pour retrouver un lot passé.
export function useWarehouseLots(
  warehouseId: string | undefined,
  filters: Pick<WarehouseHistoryFilters, "productId" | "from" | "to">,
) {
  return useQuery({
    queryKey: ["warehouse_lots", warehouseId, filters],
    enabled: Boolean(warehouseId),
    queryFn: async () => {
      let query = supabase
        .from("stock_lots")
        .select(
          "id, lot_number, quantity_received, quantity_remaining, unit_cost, expiry_date, created_at, products(id, name, unit)",
        )
        .eq("warehouse_id", warehouseId as string)
        .order("created_at", { ascending: false })
        .limit(300);

      if (filters.productId) query = query.eq("product_id", filters.productId);
      if (filters.from) query = query.gte("created_at", `${filters.from}T00:00:00.000`);
      if (filters.to) query = query.lte("created_at", `${filters.to}T23:59:59.999`);

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}
