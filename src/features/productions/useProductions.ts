import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface ProductionItemInput {
  productId: string;
  quantity: number;
  unitCost?: number;
}

export function useProductions() {
  return useQuery({
    queryKey: ["productions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("productions")
        .select("id, created_at, warehouses(name), production_items(quantity, unit_cost)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
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
          "id, created_at, user_id, users(email), warehouses(name), production_items(id, quantity, unit_cost, products(id, name))",
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
          })),
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["productions"] });
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}
