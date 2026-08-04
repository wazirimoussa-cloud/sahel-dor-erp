import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { rangeFor, splitPage } from "@/lib/usePagination";

export interface ProductionItemInput {
  productId: string;
  quantity: number;
  unitCost?: number;
  expiryDate?: string;
}

export function useProductions(page: number, pageSize: number) {
  return useQuery({
    queryKey: ["productions", page, pageSize],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("productions")
        .select("id, created_at, warehouses(name), production_items(quantity, unit_cost)")
        .order("created_at", { ascending: false })
        .range(...rangeFor(page, pageSize));
      if (error) throw error;
      return splitPage(data, pageSize);
    },
  });
}

export function useProduction(productionId: string | undefined) {
  return useQuery({
    queryKey: ["productions", productionId],
    enabled: Boolean(productionId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("productions")
        .select(
          "id, created_at, user_id, users(email), warehouses(name), production_items(id, quantity, unit_cost, products(id, name, unit))",
        )
        .eq("id", productionId as string)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateProduction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { warehouseId: string; items: ProductionItemInput[] }) => {
      const { error } = await supabase.rpc("create_production", {
        payload: {
          warehouse_id: params.warehouseId,
          items: params.items.map((item) => ({
            product_id: item.productId,
            quantity: item.quantity,
            unit_cost: item.unitCost,
            expiry_date: item.expiryDate || null,
          })),
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["productions"] });
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["product_stocks"] });
      void queryClient.invalidateQueries({ queryKey: ["stock_lots"] });
    },
  });
}
