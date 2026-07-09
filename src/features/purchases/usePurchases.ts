import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface PurchaseItemInput {
  productId: string;
  quantity: number;
  unitCost?: number;
}

export function usePurchases() {
  return useQuery({
    queryKey: ["purchases"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchases")
        .select(
          "id, status, created_at, suppliers(name), warehouses(name), companies(vat_rate), purchase_items(quantity, unit_cost)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function usePurchase(purchaseId: string | undefined) {
  return useQuery({
    queryKey: ["purchases", purchaseId],
    enabled: Boolean(purchaseId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchases")
        .select(
          "id, status, created_at, user_id, users(email), suppliers(name), warehouses(name), companies(vat_rate), purchase_items(id, quantity, unit_cost, products(id, name))",
        )
        .eq("id", purchaseId as string)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useCreatePurchase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      supplierId: string;
      warehouseId: string;
      items: PurchaseItemInput[];
    }) => {
      const { error } = await supabase.rpc("create_purchase", {
        payload: {
          supplier_id: params.supplierId,
          warehouse_id: params.warehouseId,
          items: params.items.map((item) => ({
            product_id: item.productId,
            quantity: item.quantity,
            unit_cost: item.unitCost,
          })),
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["purchases"] });
    },
  });
}

export function useReceivePurchase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (purchaseId: string) => {
      const { error } = await supabase.rpc("receive_purchase", { purchase_id: purchaseId });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["purchases"] });
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}

export function useCancelPurchase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (purchaseId: string) => {
      const { error } = await supabase.rpc("cancel_purchase", { purchase_id: purchaseId });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["purchases"] });
    },
  });
}
