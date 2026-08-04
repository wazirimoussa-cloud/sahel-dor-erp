import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { rangeFor, splitPage } from "@/lib/usePagination";

const JOURNAL_ENTRY_COLUMNS =
  "id, entry_date, journal_code, description, journal_entry_lines(id, debit, credit, chart_of_accounts(code, name))";

export function useJournalEntries(page: number, pageSize: number) {
  return useQuery({
    queryKey: ["journal_entries", page, pageSize],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("journal_entries")
        .select(JOURNAL_ENTRY_COLUMNS)
        .order("entry_date", { ascending: false })
        .range(...rangeFor(page, pageSize));
      if (error) throw error;
      return splitPage(data, pageSize);
    },
  });
}

// Réservé à l'export PDF (bouton "Exporter en PDF") : celui-ci doit couvrir tout le
// journal, pas seulement la page affichée à l'écran -- appelé à la demande au clic,
// jamais au chargement de la page.
export async function fetchAllJournalEntries() {
  const { data, error } = await supabase
    .from("journal_entries")
    .select(JOURNAL_ENTRY_COLUMNS)
    .order("entry_date", { ascending: false });
  if (error) throw error;
  return data;
}
