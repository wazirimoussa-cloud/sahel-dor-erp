import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/useAuth";

// Déclaration TVA mensuelle : TVA collectée (4431) sur les ventes de la période moins
// TVA déductible (4452) sur les achats de la période. Réutilise le même journal
// comptable que les États financiers (Phase 10), mais raisonne uniquement sur la
// période choisie (une déclaration ne porte jamais sur un solde cumulé depuis toujours).
export function useVatDeclaration(startDate: string, endDate: string) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ["vat_declaration", profile?.companyId, startDate, endDate],
    enabled: !!profile?.companyId,
    queryFn: async () => {
      const companyId = profile?.companyId;
      if (!companyId) throw new Error("Aucune société associée à ce profil.");
      const fromBound = `${startDate}T00:00:00.000`;
      const toBound = `${endDate}T23:59:59.999`;

      const [journalRes, companyRes] = await Promise.all([
        supabase
          .from("journal_entries")
          .select("entry_date, journal_entry_lines(debit, credit, chart_of_accounts(code))")
          .gte("entry_date", fromBound)
          .lte("entry_date", toBound),
        supabase.from("companies").select("vat_rate").eq("id", companyId).single(),
      ]);

      if (journalRes.error) throw journalRes.error;
      if (companyRes.error) throw companyRes.error;

      const entries = journalRes.data ?? [];

      function totals(code: string) {
        let debit = 0;
        let credit = 0;
        for (const entry of entries) {
          for (const line of entry.journal_entry_lines) {
            if (line.chart_of_accounts?.code === code) {
              debit += line.debit;
              credit += line.credit;
            }
          }
        }
        return { debit, credit };
      }

      const ventes = totals("701");
      const achats = totals("601");
      const tva4431 = totals("4431");
      const tva4452 = totals("4452");

      const chiffreAffairesHT = ventes.credit - ventes.debit;
      const achatsHT = achats.debit - achats.credit;
      const tvaCollectee = tva4431.credit - tva4431.debit;
      const tvaDeductible = tva4452.debit - tva4452.credit;
      const tvaNette = tvaCollectee - tvaDeductible;

      return {
        vatRate: companyRes.data?.vat_rate ?? 0,
        chiffreAffairesHT,
        tvaCollectee,
        achatsHT,
        tvaDeductible,
        // > 0 : TVA à payer à l'État ; < 0 : crédit de TVA à reporter sur la période suivante.
        tvaNette,
      };
    },
  });
}
