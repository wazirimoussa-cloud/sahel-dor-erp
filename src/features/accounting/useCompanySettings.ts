import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export function useCompanySettings() {
  return useQuery({
    queryKey: ["company-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("id, vat_rate").single();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateVatRate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ companyId, vatRate }: { companyId: string; vatRate: number }) => {
      const { error } = await supabase.from("companies").update({ vat_rate: vatRate }).eq("id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["company-settings"] });
    },
  });
}
