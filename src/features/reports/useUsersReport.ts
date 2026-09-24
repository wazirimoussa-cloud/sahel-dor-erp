import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface UsersReportFilters {
  active?: boolean;
}

// Jeu de données complet (pas de pagination), pour extraction. useUsers() (paginée,
// opérationnelle) n'est pas touchée par ce nouveau hook. Mêmes colonnes que UsersPage.tsx --
// jamais de mot de passe ni de donnée sensible au-delà de ce qui y est déjà affiché.
export function useUsersReport(filters: UsersReportFilters) {
  return useQuery({
    queryKey: ["reports", "users", filters],
    queryFn: async () => {
      let query = supabase
        .from("users")
        .select("id, email, login, created_at, active, roles(name), companies(name)");
      if (filters.active !== undefined) query = query.eq("active", filters.active);
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}
