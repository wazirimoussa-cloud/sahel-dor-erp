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

// Ventes (compte 701, crédit) vs Achats (compte 601, débit) par mois, sur les 6 derniers
// mois — même source que le Journal comptable, agrégée côté client (volume de données
// limité, pas besoin d'une fonction SQL dédiée, même choix que useFinancialStatements).
export function useMonthlyActivity() {
  return useQuery({
    queryKey: ["dashboard-monthly-activity"],
    queryFn: async () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 5, 1);

      const { data, error } = await supabase
        .from("journal_entries")
        .select("entry_date, journal_entry_lines(debit, credit, chart_of_accounts(code))")
        .gte("entry_date", start.toISOString());
      if (error) throw error;

      const months: { key: string; label: string; ventes: number; achats: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({
          key: `${d.getFullYear()}-${d.getMonth()}`,
          label: MONTH_LABELS[d.getMonth()],
          ventes: 0,
          achats: 0,
        });
      }
      const byKey = new Map(months.map((m) => [m.key, m]));

      for (const entry of data ?? []) {
        const d = new Date(entry.entry_date);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        const month = byKey.get(key);
        if (!month) continue;
        for (const line of entry.journal_entry_lines) {
          const code = line.chart_of_accounts?.code;
          if (code === "701") month.ventes += line.credit;
          if (code === "601") month.achats += line.debit;
        }
      }

      return months;
    },
  });
}
