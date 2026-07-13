import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface OrderItemInput {
  productId: string;
  quantity: number;
}

export function useOrders() {
  return useQuery({
    queryKey: ["orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, status, payment_status, amount_paid, created_at, clients(name), companies(vat_rate), order_items(quantity, unit_price, products(name, vat_exempt))",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      warehouseId: string;
      clientId: string;
      items: OrderItemInput[];
    }) => {
      const { error } = await supabase.rpc("create_order", {
        payload: {
          warehouse_id: params.warehouseId,
          client_id: params.clientId,
          items: params.items.map((item) => ({
            product_id: item.productId,
            quantity: item.quantity,
          })),
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}

export function useOrder(orderId: string | undefined) {
  return useQuery({
    queryKey: ["orders", orderId],
    enabled: Boolean(orderId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, status, payment_status, amount_paid, created_at, company_id, user_id, users(email), clients(id, name), companies(vat_rate), order_items(id, quantity, unit_price, products(id, name, unit, vat_exempt))",
        )
        .eq("id", orderId as string)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useValidateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await supabase.rpc("validate_order", { order_id: orderId });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}

export function useCancelOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await supabase.rpc("cancel_order", { order_id: orderId });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}

export function useRecordPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { orderId: string; amount: number }) => {
      const { error } = await supabase.rpc("record_payment", {
        order_id: params.orderId,
        amount: params.amount,
      });
      if (error) throw error;
    },
    onSuccess: (_data, params) => {
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
      void queryClient.invalidateQueries({ queryKey: ["order_payments", params.orderId] });
    },
  });
}

export function useOrderPayments(orderId: string | undefined) {
  return useQuery({
    queryKey: ["order_payments", orderId],
    enabled: Boolean(orderId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_payments")
        .select("id, amount, created_at, users(email)")
        .eq("order_id", orderId as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}
