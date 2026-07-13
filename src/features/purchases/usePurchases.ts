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
          "id, status, created_at, suppliers(name), warehouses(name), companies(vat_rate), purchase_items(quantity, unit_cost, products(vat_exempt))",
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
          "id, status, created_at, user_id, users(email), suppliers(name), warehouses(name), companies(vat_rate), purchase_items(id, quantity, unit_cost, products(id, name, unit, vat_exempt))",
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

export interface ReceivePurchaseLossInput {
  productId: string;
  transporterId: string;
  quantityLost: number;
  reason?: string;
}

export function useReceivePurchase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { purchaseId: string; losses: ReceivePurchaseLossInput[] }) => {
      const { error } = await supabase.rpc("receive_purchase", {
        purchase_id: params.purchaseId,
        losses: params.losses.map((loss) => ({
          product_id: loss.productId,
          transporter_id: loss.transporterId,
          quantity_lost: loss.quantityLost,
          reason: loss.reason || null,
        })),
      });
      if (error) throw error;
    },
    onSuccess: (_data, params) => {
      void queryClient.invalidateQueries({ queryKey: ["purchases"] });
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["purchase_losses", params.purchaseId] });
      void queryClient.invalidateQueries({ queryKey: ["purchase_losses"] });
    },
  });
}

export function usePurchaseLosses(purchaseId: string | undefined) {
  return useQuery({
    queryKey: ["purchase_losses", purchaseId],
    enabled: Boolean(purchaseId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_losses")
        .select(
          "id, quantity_lost, unit_cost, reason, created_at, products(name, unit), transporters(id, name)",
        )
        .eq("purchase_id", purchaseId as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useAllPurchaseLosses() {
  return useQuery({
    queryKey: ["purchase_losses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_losses")
        .select(
          "id, quantity_lost, unit_cost, reason, created_at, purchase_id, products(name, unit), transporters(id, name)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
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
