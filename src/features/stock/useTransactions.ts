import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { TransactionType } from "@/lib/database.types";

export interface NewTransaction {
  productId: string;
  warehouseId: string;
  type: TransactionType;
  quantity: number;
  userId: string;
  note?: string;
}

export interface StockTransfer {
  productId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  quantity: number;
}

export function useTransactions() {
  return useQuery({
    queryKey: ["transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, type, quantity, note, created_at, products(name, unit), warehouses(name)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (transaction: NewTransaction) => {
      const { error } = await supabase.from("transactions").insert({
        product_id: transaction.productId,
        warehouse_id: transaction.warehouseId,
        type: transaction.type,
        quantity: transaction.quantity,
        user_id: transaction.userId,
        note: transaction.note || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      // Le trigger fn_apply_transaction_stock met déjà à jour products.stock côté DB ;
      // on invalide les deux caches pour refléter le nouveau stock à l'écran.
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      void queryClient.invalidateQueries({ queryKey: ["product_stocks"] });
    },
  });
}

export function useTransferStock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (transfer: StockTransfer) => {
      const { error } = await supabase.rpc("transfer_stock", {
        p_product_id: transfer.productId,
        p_from_warehouse_id: transfer.fromWarehouseId,
        p_to_warehouse_id: transfer.toWarehouseId,
        p_quantity: transfer.quantity,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      void queryClient.invalidateQueries({ queryKey: ["product_stocks"] });
    },
  });
}
