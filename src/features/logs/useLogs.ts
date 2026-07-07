import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export function useLogs() {
  return useQuery({
    queryKey: ["logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("logs")
        .select("id, action, module, metadata, created_at, users(email)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });
}
