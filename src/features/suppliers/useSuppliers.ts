import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { rangeFor, splitPage } from "@/lib/usePagination";

export interface NewSupplier {
  companyId: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
}

export function useSuppliers(page: number, pageSize: number) {
  return useQuery({
    queryKey: ["suppliers", page, pageSize],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name, phone, email, address, company_id, created_at, active")
        .order("name", { ascending: true })
        .range(...rangeFor(page, pageSize));
      if (error) throw error;
      return splitPage(data, pageSize);
    },
  });
}

// Réservé aux listes de sélection pour un nouvel achat : un fournisseur archivé reste
// visible dans /suppliers (via useSuppliers) pour qu'on puisse le réactiver, mais ne
// doit plus pouvoir être choisi pour un nouvel achat.
export function useActiveSuppliers() {
  return useQuery({
    queryKey: ["suppliers", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name")
        .eq("active", true)
        .order("name", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (supplier: NewSupplier) => {
      const { error } = await supabase.from("suppliers").insert({
        company_id: supplier.companyId,
        name: supplier.name,
        phone: supplier.phone || null,
        email: supplier.email || null,
        address: supplier.address || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
  });
}

export function useSetSupplierActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ supplierId, active }: { supplierId: string; active: boolean }) => {
      const { error } = await supabase.from("suppliers").update({ active }).eq("id", supplierId);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
  });
}
