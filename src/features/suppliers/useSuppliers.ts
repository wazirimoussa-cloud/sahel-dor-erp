import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface NewSupplier {
  companyId: string;
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
}

export function useSuppliers() {
  return useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name, contact_name, phone, email, address, company_id, created_at")
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
        contact_name: supplier.contactName || null,
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
