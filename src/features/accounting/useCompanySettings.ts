import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export function useCompanySettings() {
  return useQuery({
    queryKey: ["company-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select(
          "id, vat_rate, impot_societes_rate, taxe_professionnelle_rate, precompte_isb_rate, taxe_immobiliere_rate, taxe_professionnelle_droit_fixe_pour_mille, taxe_professionnelle_plancher, taxe_professionnelle_droit_proportionnel_rate, taxe_professionnelle_ca_annuel, taxe_professionnelle_valeur_locative, irvm_dividendes_rate, irvm_plus_values_cession_rate, irvm_obligations_rate, droits_enregistrement_actes_societe, droits_enregistrement_fonds_commerce_rate, taxe_publicite_panneau_papier_rate, taxe_publicite_panneau_autre_rate, redevance_domaine_public_rate",
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
  irvmDividendesRate: number;
  irvmPlusValuesCessionRate: number;
  irvmObligationsRate: number;
  droitsEnregistrementActesSociete: number;
  droitsEnregistrementFondsCommerceRate: number;
  taxePublicitePanneauPapierRate: number;
  taxePublicitePanneauAutreRate: number;
  redevanceDomainePublicRate: number;
}

// Passe par la RPC update_fiscal_rates (0087) au lieu d'un update() direct : elle trace
// chaque champ réellement modifié dans fiscal_rate_history (qui, quand, avant, après) —
// même philosophie que update_product_price/product_price_history (0024).
export function useUpdateFiscalRates() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ companyId, rates }: { companyId: string; rates: FiscalRates }) => {
      const { error } = await supabase.rpc("update_fiscal_rates", {
        p_company_id: companyId,
        p_vat_rate: rates.vatRate,
        p_impot_societes_rate: rates.impotSocietesRate,
        p_precompte_isb_rate: rates.precompteIsbRate,
        p_taxe_immobiliere_rate: rates.taxeImmobiliereRate,
        p_taxe_professionnelle_droit_fixe_pour_mille: rates.taxeProfessionnelleDroitFixePourMille,
        p_taxe_professionnelle_plancher: rates.taxeProfessionnellePlancher,
        p_taxe_professionnelle_droit_proportionnel_rate: rates.taxeProfessionnelleDroitProportionnelRate,
        p_taxe_professionnelle_ca_annuel: rates.taxeProfessionnelleCaAnnuel,
        p_taxe_professionnelle_valeur_locative: rates.taxeProfessionnelleValeurLocative,
        p_irvm_dividendes_rate: rates.irvmDividendesRate,
        p_irvm_plus_values_cession_rate: rates.irvmPlusValuesCessionRate,
        p_irvm_obligations_rate: rates.irvmObligationsRate,
        p_droits_enregistrement_actes_societe: rates.droitsEnregistrementActesSociete,
        p_droits_enregistrement_fonds_commerce_rate: rates.droitsEnregistrementFondsCommerceRate,
        p_taxe_publicite_panneau_papier_rate: rates.taxePublicitePanneauPapierRate,
        p_taxe_publicite_panneau_autre_rate: rates.taxePublicitePanneauAutreRate,
        p_redevance_domaine_public_rate: rates.redevanceDomainePublicRate,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["company-settings"] });
      void queryClient.invalidateQueries({ queryKey: ["fiscal_rate_history"] });
    },
  });
}

export function useFiscalRateHistory(companyId: string | undefined) {
  return useQuery({
    queryKey: ["fiscal_rate_history", companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fiscal_rate_history")
        .select("id, field_name, old_value, new_value, created_at, users(email)")
        .eq("company_id", companyId as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}
