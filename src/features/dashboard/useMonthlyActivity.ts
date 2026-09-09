import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

const MONTH_LABELS = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
];

// Ventes (compte 701, crédit) vs Achats (compte 601, débit) et solde de trésorerie
// (compte 521) par mois, sur les 6 derniers mois — même source que le Journal comptable,
// agrégée côté client (volume de données limité, pas besoin d'une fonction SQL dédiée,
// même choix que useFinancialStatements).
//
// Ventes/Achats sont des FLUX (remis à zéro chaque mois) ; la trésorerie est un SOLDE
// CUMULÉ -- il faut donc un point de départ (solde du compte 521 juste avant la fenêtre de
// 6 mois, une requête séparée bornée en amont plutôt que de refaire tout l'historique),
// puis accumuler mois par mois à partir de ce point plutôt que de remettre à zéro.
export function useMonthlyActivity() {
  return useQuery({
    queryKey: ["dashboard-monthly-activity"],
    queryFn: async () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      const startIso = start.toISOString();

      const [windowRes, priorRes] = await Promise.all([
        supabase
          .from("journal_entries")
          .select("entry_date, journal_entry_lines(debit, credit, chart_of_accounts(code))")
          .gte("entry_date", startIso),
        supabase
          .from("journal_entries")
          .select("entry_date, journal_entry_lines(debit, credit, chart_of_accounts(code))")
          .lt("entry_date", startIso),
      ]);
      if (windowRes.error) throw windowRes.error;
      if (priorRes.error) throw priorRes.error;

      let tresorerieSolde = 0;
      for (const entry of priorRes.data ?? []) {
        for (const line of entry.journal_entry_lines) {
          if (line.chart_of_accounts?.code === "521") tresorerieSolde += line.debit - line.credit;
        }
      }

      const months: {
        key: string;
        label: string;
        ventes: number;
        achats: number;
        tresorerie: number;
      }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({
          key: `${d.getFullYear()}-${d.getMonth()}`,
          label: MONTH_LABELS[d.getMonth()],
          ventes: 0,
          achats: 0,
          tresorerie: 0,
        });
      }
      const byKey = new Map(months.map((m) => [m.key, m]));

      for (const entry of windowRes.data ?? []) {
        const d = new Date(entry.entry_date);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        const month = byKey.get(key);
        if (!month) continue;
        for (const line of entry.journal_entry_lines) {
          const code = line.chart_of_accounts?.code;
          if (code === "701") month.ventes += line.credit;
          if (code === "601") month.achats += line.debit;
          if (code === "521") month.tresorerie += line.debit - line.credit;
        }
      }

      // Accumulation du solde de trésorerie : chaque mois porte désormais le solde cumulé
      // à sa fin, pas sa seule variation propre.
      let running = tresorerieSolde;
      for (const month of months) {
        running += month.tresorerie;
        month.tresorerie = running;
      }

      return months;
    },
  });
}
