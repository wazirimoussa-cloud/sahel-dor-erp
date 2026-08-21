import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { rangeFor, splitPage } from "@/lib/usePagination";

export interface NewTransporter {
  companyId: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
}

export function useTransporters(page: number, pageSize: number) {
  return useQuery({
    queryKey: ["transporters", page, pageSize],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transporters")
        .select("id, name, phone, email, address, company_id, created_at")
        .order("name", { ascending: true })
        .range(...rangeFor(page, pageSize));
      if (error) throw error;
      return splitPage(data, pageSize);
    },
  });
}

// Réservé aux listes de sélection (ex. transporteur à la réception d'un achat) : pas de
// notion d'archivage pour les transporteurs, donc la liste complète reste nécessaire.
export function useAllTransporters() {
  return useQuery({
    queryKey: ["transporters", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transporters")
        .select("id, name")
        .order("name", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateTransporter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (transporter: NewTransporter) => {
      const { error } = await supabase.from("transporters").insert({
        company_id: transporter.companyId,
        name: transporter.name,
        phone: transporter.phone || null,
        email: transporter.email || null,
        address: transporter.address || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["transporters"] });
    },
  });
}
