import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { rangeFor, splitPage } from "@/lib/usePagination";

export interface NewProduct {
  companyId: string;
  name: string;
  purchaseCost: number;
  freightCost: number;
  handlingCost: number;
  sellingPrice: number;
  stock: number;
  unit: string;
  vatExempt: boolean;
}

export function useProducts(page: number, pageSize: number) {
  return useQuery({
    queryKey: ["products", page, pageSize],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, name, selling_price, purchase_cost, freight_cost, handling_cost, unit_cost, stock, unit, vat_exempt, company_id, created_at, active",
        )
        .order("name", { ascending: true })
        .range(...rangeFor(page, pageSize));
      if (error) throw error;
      return splitPage(data, pageSize);
    },
  });
}

// Réservé aux filtres qui doivent couvrir tout l'historique (ex. filtre "Produit" d'un
// historique de mouvements de magasin) : une transaction passée peut référencer un
// produit désormais archivé, contrairement à useActiveProducts qui l'exclurait.
export function useAllProducts() {
  return useQuery({
    queryKey: ["products", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, selling_price, unit_cost, stock, unit, vat_exempt")
        .order("name", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

// Réservé aux listes de sélection pour une nouvelle opération (achat, commande,
// mouvement, transfert, production, transformation, perte...) : un produit archivé
// reste visible dans /products (via useProducts) pour qu'on puisse le réactiver ou
// rechercher son historique, mais ne doit plus pouvoir être choisi pour une nouvelle
// opération.
export function useActiveProducts() {
  return useQuery({
    queryKey: ["products", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, selling_price, unit_cost, stock, unit, vat_exempt")
        .eq("active", true)
        .order("name", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useSetProductActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ productId, active }: { productId: string; active: boolean }) => {
      const { error } = await supabase.from("products").update({ active }).eq("id", productId);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["products"] });
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
        purchase_cost: product.purchaseCost,
        freight_cost: product.freightCost,
        handling_cost: product.handlingCost,
        selling_price: product.sellingPrice,
        stock: product.stock,
        unit: product.unit,
        vat_exempt: product.vatExempt,
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
