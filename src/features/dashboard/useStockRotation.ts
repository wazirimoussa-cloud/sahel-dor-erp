import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  buildUnitCostMap,
  stockValueAsOf,
  daysBetweenInclusive,
  computeStockRotation,
} from "@/lib/stockValuation";

// Rotation des stocks + valeur du stock, pour le dashboard Magasin -- version allégée de
// useFinancialStatements.ts (mêmes calculs, via src/lib/stockValuation.ts) mais SANS le
// journal comptable ni les immobilisations : ce dashboard est montré à un profil qui n'a
// souvent aucun accès comptable, et journal_entries + stock_lots est déjà la jointure la
// plus lourde de l'app (voir README, tests de charge) -- inutile de la refaire ici pour un
// simple ratio de stock. Safe d'appeler ce hook deux fois (période + N-1).
export function useStockRotation(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ["dashboard-stock-rotation", startDate, endDate],
    queryFn: async () => {
      const endBound = `${endDate}T23:59:59.999`;

      const [productsRes, purchaseLotsRes, transactionsRes] = await Promise.all([
        supabase.from("products").select("id, name, unit"),
        supabase
          .from("stock_lots")
          .select(
            "product_id, quantity_received, unit_cost, transactions!stock_lots_source_transaction_id_fkey!inner(purchase_id)",
          )
          .not("transactions.purchase_id", "is", null),
        supabase
          .from("transactions")
          .select("product_id, type, quantity, created_at")
          .lte("created_at", endBound),
      ]);

      if (productsRes.error) throw productsRes.error;
      if (purchaseLotsRes.error) throw purchaseLotsRes.error;
      if (transactionsRes.error) throw transactionsRes.error;

      const products = productsRes.data;
      const purchaseLots = purchaseLotsRes.data;
      const transactions = transactionsRes.data ?? [];

      const unitCostByProduct = buildUnitCostMap(purchaseLots);
      const stockStart = stockValueAsOf({ products, transactions }, unitCostByProduct, startDate);
      const stockEnd = stockValueAsOf({ products, transactions }, unitCostByProduct, endDate);
      const days = daysBetweenInclusive(startDate, endDate);
      const { rotationStock, rotationStockJours } = computeStockRotation(
        transactions,
        unitCostByProduct,
        startDate,
        endDate,
        stockStart,
        stockEnd,
        days,
      );

      return {
        rotationStock,
        rotationStockJours,
        stockValue: stockEnd.total,
      };
    },
  });
}
