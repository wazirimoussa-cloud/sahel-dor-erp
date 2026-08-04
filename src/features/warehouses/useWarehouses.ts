import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { rangeFor, splitPage } from "@/lib/usePagination";

export interface NewWarehouse {
  companyId: string;
  name: string;
  location?: string;
}

export function useWarehouses(page: number, pageSize: number) {
  return useQuery({
    queryKey: ["warehouses", page, pageSize],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id, name, location, company_id, created_at, active")
        .order("name", { ascending: true })
        .range(...rangeFor(page, pageSize));
      if (error) throw error;
      return splitPage(data, pageSize);
    },
  });
}

// Réservé aux listes de sélection pour une nouvelle opération (achat, commande,
// mouvement, transfert...) : un magasin archivé reste visible dans /warehouses (via
// useWarehouses) pour qu'on puisse le réactiver, mais ne doit plus pouvoir être choisi
// pour une nouvelle opération.
export function useActiveWarehouses() {
  return useQuery({
    queryKey: ["warehouses", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id, name, location")
        .eq("active", true)
        .order("name", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useWarehouse(warehouseId: string | undefined) {
  return useQuery({
    queryKey: ["warehouses", warehouseId],
    enabled: Boolean(warehouseId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id, name, location")
        .eq("id", warehouseId as string)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateWarehouse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (warehouse: NewWarehouse) => {
      const { error } = await supabase.from("warehouses").insert({
        company_id: warehouse.companyId,
        name: warehouse.name,
        location: warehouse.location || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["warehouses"] });
    },
  });
}

export function useSetWarehouseActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ warehouseId, active }: { warehouseId: string; active: boolean }) => {
      const { error } = await supabase.from("warehouses").update({ active }).eq("id", warehouseId);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["warehouses"] });
    },
  });
}
