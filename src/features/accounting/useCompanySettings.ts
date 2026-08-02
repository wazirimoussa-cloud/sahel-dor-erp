import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export function useCompanySettings() {
  return useQuery({
    queryKey: ["company-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select(
          "id, vat_rate, impot_societes_rate, taxe_professionnelle_rate, precompte_isb_rate, taxe_immobiliere_rate",
        )
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export interface FiscalRates {
  vatRate: number;
  impotSocietesRate: number;
  precompteIsbRate: number;
  taxeImmobiliereRate: number;
}

export function useUpdateFiscalRates() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ companyId, rates }: { companyId: string; rates: FiscalRates }) => {
      const { error } = await supabase
        .from("companies")
        .update({
          vat_rate: rates.vatRate,
          impot_societes_rate: rates.impotSocietesRate,
          precompte_isb_rate: rates.precompteIsbRate,
          taxe_immobiliere_rate: rates.taxeImmobiliereRate,
        })
        .eq("id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["company-settings"] });
    },
  });
}
