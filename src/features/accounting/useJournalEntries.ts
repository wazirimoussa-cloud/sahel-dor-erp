import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export function useJournalEntries() {
  return useQuery({
    queryKey: ["journal_entries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("journal_entries")
        .select(
          "id, entry_date, journal_code, description, journal_entry_lines(id, debit, credit, chart_of_accounts(code, name))",
        )
        .order("entry_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}
