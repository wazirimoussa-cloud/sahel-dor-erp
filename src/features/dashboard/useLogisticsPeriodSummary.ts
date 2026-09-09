import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// Résumé de l'activité "pertes" sur une période -- deux circuits distincts, gardés par deux
// modules distincts sur le dashboard (transporteurs / pertes_stock) :
//  - purchase_losses : pertes constatées à la réception (transporteur), déjà valorisées
//    (unit_cost réel de l'époque).
//  - stock_loss_requests : déclaration/approbation de pertes en magasin
//    (0031_stock_loss_requests.sql), status pending/approved/rejected + reviewed_at renseigné
//    à la décision -- permet un vrai délai moyen d'approbation. Pas de coût unitaire sur
//    cette table (contrairement à purchase_losses) : pas de "valeur" inventée ici, seuls
//    comptes et taux sont exposés.
export function useLogisticsPeriodSummary(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ["dashboard-logistics-period-summary", startDate, endDate],
    queryFn: async () => {
      const from = `${startDate}T00:00:00.000`;
      const to = `${endDate}T23:59:59.999`;

      const [lossesRes, requestsRes] = await Promise.all([
        supabase
          .from("purchase_losses")
          .select("id, quantity_lost, unit_cost, created_at")
          .gte("created_at", from)
          .lte("created_at", to),
        supabase
          .from("stock_loss_requests")
          .select("id, status, created_at, reviewed_at")
          .gte("created_at", from)
          .lte("created_at", to),
      ]);
      if (lossesRes.error) throw lossesRes.error;
      if (requestsRes.error) throw requestsRes.error;

      const losses = lossesRes.data ?? [];
      const requests = requestsRes.data ?? [];

      const lossesValue = losses.reduce((sum, l) => sum + l.quantity_lost * l.unit_cost, 0);

      const approved = requests.filter((r) => r.status === "approved");
      const rejected = requests.filter((r) => r.status === "rejected");
      const resolvedCount = approved.length + rejected.length;
      const approvalRate = resolvedCount > 0 ? approved.length / resolvedCount : null;

      const resolvedWithDelay = [...approved, ...rejected].filter((r) => r.reviewed_at);
      const avgApprovalDelayDays =
        resolvedWithDelay.length > 0
          ? resolvedWithDelay.reduce(
              (sum, r) =>
                sum + (new Date(r.reviewed_at as string).getTime() - new Date(r.created_at).getTime()) / 86_400_000,
              0,
            ) / resolvedWithDelay.length
          : null;

      return {
        lossesCount: losses.length,
        lossesValue,
        declaredCount: requests.length,
        approvalRate,
        avgApprovalDelayDays,
      };
    },
  });
}
