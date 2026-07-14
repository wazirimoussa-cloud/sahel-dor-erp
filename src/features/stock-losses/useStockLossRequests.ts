import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export function useStockLossRequests() {
  return useQuery({
    queryKey: ["stock_loss_requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_loss_requests")
        .select(
          "id, quantity, repackaged_quantity, reason, status, rejection_reason, created_at, reviewed_at, products(name, unit), warehouses(name), requester:users!requested_by(email), reviewer:users!reviewed_by(email)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useRequestStockLoss() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      productId: string;
      warehouseId: string;
      quantity: number;
      reason: string;
      repackagedQuantity?: number;
    }) => {
      const { error } = await supabase.rpc("request_stock_loss", {
        p_product_id: params.productId,
        p_warehouse_id: params.warehouseId,
        p_quantity: params.quantity,
        p_reason: params.reason,
        p_repackaged_quantity: params.repackagedQuantity,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["stock_loss_requests"] });
    },
  });
}

export function useApproveStockLoss() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase.rpc("approve_stock_loss", { p_request_id: requestId });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["stock_loss_requests"] });
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["transformations"] });
    },
  });
}

export function useRejectStockLoss() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { requestId: string; rejectionReason: string }) => {
      const { error } = await supabase.rpc("reject_stock_loss", {
        p_request_id: params.requestId,
        p_rejection_reason: params.rejectionReason,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["stock_loss_requests"] });
    },
  });
}
