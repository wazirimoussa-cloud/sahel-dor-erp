import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface TransformationInputInput {
  productId: string;
  quantity: number;
}

export interface TransformationOutputInput {
  productId: string;
  quantity: number;
  unitCost?: number;
}

export function useTransformations() {
  return useQuery({
    queryKey: ["transformations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transformations")
        .select(
          "id, created_at, warehouses(name), transformation_inputs(quantity), transformation_outputs(quantity, unit_cost)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useTransformation(transformationId: string | undefined) {
  return useQuery({
    queryKey: ["transformations", transformationId],
    enabled: Boolean(transformationId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transformations")
        .select(
          "id, created_at, user_id, users(email), warehouses(name), transformation_inputs(id, quantity, products(id, name)), transformation_outputs(id, quantity, unit_cost, products(id, name))",
        )
        .eq("id", transformationId as string)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateTransformation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      warehouseId: string;
      inputs: TransformationInputInput[];
      outputs: TransformationOutputInput[];
    }) => {
      const { error } = await supabase.rpc("create_transformation", {
        payload: {
          warehouse_id: params.warehouseId,
          inputs: params.inputs.map((item) => ({
            product_id: item.productId,
            quantity: item.quantity,
          })),
          outputs: params.outputs.map((item) => ({
            product_id: item.productId,
            quantity: item.quantity,
            unit_cost: item.unitCost,
          })),
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["transformations"] });
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}
