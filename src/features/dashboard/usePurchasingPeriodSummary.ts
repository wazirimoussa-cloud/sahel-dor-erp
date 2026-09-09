import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

const TOP_N = 5;

export interface PurchasesBySupplier {
  supplierId: string;
  name: string;
  total: number;
}

function relation<T>(value: T | T[] | null): T | undefined {
  return Array.isArray(value) ? value[0] : (value ?? undefined);
}

// Résumé de l'activité d'achat sur une période -- bons d'achat reçus uniquement (le compte
// 601 n'est débité qu'à la réception, voir receive_purchase() dans
// 0075_prix_de_revient_produit.sql -- même logique que useSalesPeriodSummary.ts côté 701).
// Filtre sur received_at (pas created_at) : c'est la date qui porte la reconnaissance
// comptable, exactement comme created_at pour les commandes validées.
export function usePurchasingPeriodSummary(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ["dashboard-purchasing-period-summary", startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchases")
        .select("supplier_id, received_at, suppliers(name), purchase_items(quantity, unit_cost)")
        .eq("status", "received")
        .gte("received_at", `${startDate}T00:00:00.000`)
        .lte("received_at", `${endDate}T23:59:59.999`);
      if (error) throw error;

      const purchases = data ?? [];
      let totalHT = 0;
      const bySupplier = new Map<string, PurchasesBySupplier>();

      for (const purchase of purchases) {
        const purchaseTotal = (purchase.purchase_items ?? []).reduce(
          (sum, item) => sum + item.quantity * item.unit_cost,
          0,
        );
        totalHT += purchaseTotal;

        const supplier = relation(purchase.suppliers);
        const existing = bySupplier.get(purchase.supplier_id);
        if (existing) {
          existing.total += purchaseTotal;
        } else {
          bySupplier.set(purchase.supplier_id, {
            supplierId: purchase.supplier_id,
            name: supplier?.name ?? "—",
            total: purchaseTotal,
          });
        }
      }

      const purchaseCount = purchases.length;
      return {
        totalHT,
        purchaseCount,
        averagePurchase: purchaseCount > 0 ? totalHT / purchaseCount : null,
        topSuppliers: [...bySupplier.values()].sort((a, b) => b.total - a.total).slice(0, TOP_N),
      };
    },
  });
}
