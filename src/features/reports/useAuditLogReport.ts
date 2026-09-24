import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface AuditLogReportFilters {
  dateFrom?: string;
  dateTo?: string;
  userId?: string;
  module?: string;
  action?: string;
}

// Corrige la vraie lacune trouvée en auditant les 11 domaines : useLogs() (LogsPage.tsx)
// est plafonnée en dur à 100 lignes, sans aucun filtre. Ici : aucun filtre posé -> 500
// lignes max (garde-fou, évite de rapatrier des années de journal en un clic) ; dès qu'au
// moins un filtre réduit la plage, la limite disparaît (jeu de données complet). useLogs()
// elle-même n'est pas modifiée.
const UNFILTERED_LIMIT = 500;

export function useAuditLogReport(filters: AuditLogReportFilters) {
  const hasAnyFilter = Object.values(filters).some((v) => v !== undefined && v !== "");
  return useQuery({
    queryKey: ["reports", "audit_log", filters],
    queryFn: async () => {
      let query = supabase.from("logs").select("id, action, module, metadata, created_at, user_id, users(email)");
      if (filters.dateFrom) query = query.gte("created_at", `${filters.dateFrom}T00:00:00.000`);
      if (filters.dateTo) query = query.lte("created_at", `${filters.dateTo}T23:59:59.999`);
      if (filters.userId) query = query.eq("user_id", filters.userId);
      if (filters.module) query = query.ilike("module", `%${filters.module}%`);
      if (filters.action) query = query.eq("action", filters.action);
      query = query.order("created_at", { ascending: false });
      if (!hasAnyFilter) query = query.limit(UNFILTERED_LIMIT);
      const { data, error } = await query;
      if (error) throw error;
      return { rows: data, capped: !hasAnyFilter && data.length >= UNFILTERED_LIMIT };
    },
  });
}
