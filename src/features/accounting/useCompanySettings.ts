import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export function useCompanySettings() {
  return useQuery({
    queryKey: ["company-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select(
          "id, vat_rate, impot_societes_rate, taxe_professionnelle_rate, precompte_isb_rate, taxe_immobiliere_rate, taxe_professionnelle_droit_fixe_pour_mille, taxe_professionnelle_plancher, taxe_professionnelle_droit_proportionnel_rate, taxe_professionnelle_ca_annuel, taxe_professionnelle_valeur_locative",
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
  taxeProfessionnelleDroitFixePourMille: number;
  taxeProfessionnellePlancher: number;
  taxeProfessionnelleDroitProportionnelRate: number;
  taxeProfessionnelleCaAnnuel: number;
  taxeProfessionnelleValeurLocative: number;
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
          taxe_professionnelle_droit_fixe_pour_mille: rates.taxeProfessionnelleDroitFixePourMille,
          taxe_professionnelle_plancher: rates.taxeProfessionnellePlancher,
          taxe_professionnelle_droit_proportionnel_rate: rates.taxeProfessionnelleDroitProportionnelRate,
          taxe_professionnelle_ca_annuel: rates.taxeProfessionnelleCaAnnuel,
          taxe_professionnelle_valeur_locative: rates.taxeProfessionnelleValeurLocative,
        })
        .eq("id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["company-settings"] });
    },
  });
}
