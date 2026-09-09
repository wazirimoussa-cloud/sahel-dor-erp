import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// Résumé de l'activité de validation sur une période -- orders n'a ni validated_at ni
// validated_by (contrairement aux autres dashboards, aucun délai de validation ni volume
// "validé par ce superviseur" n'est mesurable), created_at reste donc le seul filtre de
// période possible, même limite que partout ailleurs dans l'app. status compte les
// annulations manuelles ET automatiques (0083_annulation_automatique_bon_commande.sql) sans
// distinction -- le statut ne porte pas la cause.
export function useSupervisorPeriodSummary(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ["dashboard-supervisor-period-summary", startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("status, created_at")
        .in("status", ["validated", "cancelled"])
        .gte("created_at", `${startDate}T00:00:00.000`)
        .lte("created_at", `${endDate}T23:59:59.999`);
      if (error) throw error;

      const orders = data ?? [];
      const validatedCount = orders.filter((o) => o.status === "validated").length;
      const cancelledCount = orders.filter((o) => o.status === "cancelled").length;
      const resolvedCount = validatedCount + cancelledCount;

      return {
        validatedCount,
        cancelledCount,
        cancellationRate: resolvedCount > 0 ? cancelledCount / resolvedCount : null,
      };
    },
  });
}
