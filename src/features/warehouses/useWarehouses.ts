import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface NewWarehouse {
  companyId: string;
  name: string;
  location?: string;
}

export function useWarehouses() {
  return useQuery({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id, name, location, company_id, created_at")
        .order("name", { ascending: true });
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
