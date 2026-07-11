import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface NewTransporter {
  companyId: string;
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
}

export function useTransporters() {
  return useQuery({
    queryKey: ["transporters"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transporters")
        .select("id, name, contact_name, phone, email, address, company_id, created_at")
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
        contact_name: transporter.contactName || null,
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
