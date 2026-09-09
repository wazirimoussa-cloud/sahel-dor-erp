import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// Résumé de l'activité de production/transformation sur une période -- ce sont des faits
// atomiques immédiats (pas de workflow différé, voir 0006_production.sql/0007_transformations.sql),
// created_at est donc directement la date de reconnaissance, contrairement à Achats/Ventes
// où il a fallu choisir entre created_at et une date de statut. Valeur produite = somme des
// lignes déjà valorisées : production_items.unit_cost pour les productions, et
// transformation_outputs.unit_cost pour les transformations (les intrants n'ont pas de coût
// unitaire propre -- ils sont consommés à leur CUMP, voir create_transformation).
export function useProductionPeriodSummary(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ["dashboard-production-period-summary", startDate, endDate],
    queryFn: async () => {
      const from = `${startDate}T00:00:00.000`;
      const to = `${endDate}T23:59:59.999`;

      const [productionsRes, transformationsRes] = await Promise.all([
        supabase
          .from("productions")
          .select("id, created_at, production_items(quantity, unit_cost)")
          .gte("created_at", from)
          .lte("created_at", to),
        supabase
          .from("transformations")
          .select("id, created_at, transformation_outputs(quantity, unit_cost)")
          .gte("created_at", from)
          .lte("created_at", to),
      ]);
      if (productionsRes.error) throw productionsRes.error;
      if (transformationsRes.error) throw transformationsRes.error;

      const productions = productionsRes.data ?? [];
      const transformations = transformationsRes.data ?? [];

      const productionsValue = productions.reduce(
        (sum, p) =>
          sum + (p.production_items ?? []).reduce((s, item) => s + item.quantity * item.unit_cost, 0),
        0,
      );
      const transformationsValue = transformations.reduce(
        (sum, t) =>
          sum +
          (t.transformation_outputs ?? []).reduce((s, item) => s + item.quantity * item.unit_cost, 0),
        0,
      );

      return {
        productionsCount: productions.length,
        productionsValue,
        transformationsCount: transformations.length,
        transformationsValue,
      };
    },
  });
}
