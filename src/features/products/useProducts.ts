import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface NewProduct {
  companyId: string;
  name: string;
  price: number;
  stock: number;
  unit: string;
}

export function useProducts() {
  return useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, price, stock, unit, company_id, created_at")
        .order("name", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (product: NewProduct) => {
      const { error } = await supabase.from("products").insert({
        company_id: product.companyId,
        name: product.name,
        price: product.price,
        stock: product.stock,
        unit: product.unit,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

export function useUpdateProductPrice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { productId: string; newPrice: number; reason?: string }) => {
      const { error } = await supabase.rpc("update_product_price", {
        product_id: params.productId,
        new_price: params.newPrice,
        reason: params.reason || undefined,
      });
      if (error) throw error;
    },
    onSuccess: (_data, params) => {
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      void queryClient.invalidateQueries({ queryKey: ["product_price_history", params.productId] });
    },
  });
}

export function usePriceHistory(productId: string | undefined) {
  return useQuery({
    queryKey: ["product_price_history", productId],
    enabled: Boolean(productId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_price_history")
        .select("id, old_price, new_price, reason, created_at, users(email)")
        .eq("product_id", productId as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}
