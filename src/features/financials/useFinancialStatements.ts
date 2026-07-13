import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/useAuth";

interface StockSnapshot {
  total: number;
  unvalued: { productId: string; name: string; quantity: number; unit: string }[];
}

interface AccountBalance {
  debit: number;
  credit: number;
}

// Calcule bilan + compte de résultat + analyse financière à la demande, à partir des
// données déjà en place (journal comptable, achats, mouvements de stock). Aucune
// nouvelle table : voir supabase/migrations/0017_financial_statements.sql pour le seul
// ajout de schéma (capital_social).
export function useFinancialStatements(startDate: string, endDate: string) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ["financial_statements", profile?.companyId, startDate, endDate],
    enabled: !!profile?.companyId,
    queryFn: async () => {
      const companyId = profile?.companyId;
      if (!companyId) throw new Error("Aucune société associée à ce profil.");
      const endBound = `${endDate}T23:59:59.999`;

      const [productsRes, purchaseItemsRes, transactionsRes, journalRes, companyRes] =
        await Promise.all([
          supabase.from("products").select("id, name, unit"),
          supabase
            .from("purchase_items")
            .select("product_id, quantity, unit_cost, purchases!inner(status)")
            .eq("purchases.status", "received"),
          supabase
            .from("transactions")
            .select("product_id, type, quantity, created_at")
            .lte("created_at", endBound),
          supabase
            .from("journal_entries")
            .select("entry_date, journal_entry_lines(debit, credit, chart_of_accounts(code))"),
          supabase.from("companies").select("capital_social").eq("id", companyId).single(),
        ]);

      if (productsRes.error) throw productsRes.error;
      if (purchaseItemsRes.error) throw purchaseItemsRes.error;
      if (transactionsRes.error) throw transactionsRes.error;
      if (journalRes.error) throw journalRes.error;
      if (companyRes.error) throw companyRes.error;

      const transactions = transactionsRes.data ?? [];
      const journalEntries = journalRes.data ?? [];
      const productNameById = new Map(productsRes.data.map((p) => [p.id, p.name]));
      const productUnitById = new Map(productsRes.data.map((p) => [p.id, p.unit]));

      // CUMP global par produit, à partir des seuls achats réceptionnés (coût réel).
      const cump = new Map<string, { qty: number; cost: number }>();
      for (const item of purchaseItemsRes.data) {
        const entry = cump.get(item.product_id) ?? { qty: 0, cost: 0 };
        entry.qty += item.quantity;
        entry.cost += item.quantity * item.unit_cost;
        cump.set(item.product_id, entry);
      }
      const unitCostByProduct = new Map(
        [...cump].map(([productId, { qty, cost }]) => [productId, qty > 0 ? cost / qty : 0]),
      );

      function stockValueAsOf(dateIso: string): StockSnapshot {
        const bound = `${dateIso}T23:59:59.999`;
        const qtyByProduct = new Map<string, number>();
        for (const t of transactions) {
          if (t.created_at > bound) continue;
          const delta = t.type === "IN" ? t.quantity : t.type === "OUT" ? -t.quantity : t.quantity;
          qtyByProduct.set(t.product_id, (qtyByProduct.get(t.product_id) ?? 0) + delta);
        }
        let total = 0;
        const unvalued: { productId: string; name: string; quantity: number; unit: string }[] = [];
        for (const [productId, quantity] of qtyByProduct) {
          if (quantity <= 0) continue;
          const unitCost = unitCostByProduct.get(productId);
          if (unitCost !== undefined) {
            total += quantity * unitCost;
          } else {
            unvalued.push({
              productId,
              name: productNameById.get(productId) ?? "?",
              quantity,
              unit: productUnitById.get(productId) ?? "",
            });
          }
        }
        return { total, unvalued };
      }

      const stockStart = stockValueAsOf(startDate);
      const stockEnd = stockValueAsOf(endDate);

      // Solde d'un compte (par code) : somme débit/crédit des lignes dont l'écriture
      // parente a une entry_date dans [from, to] (bornes optionnelles = illimité).
      function accountTotals(code: string, from?: string, to?: string): AccountBalance {
        const fromBound = from ? `${from}T00:00:00.000` : undefined;
        const toBound = to ? `${to}T23:59:59.999` : undefined;
        let debit = 0;
        let credit = 0;
        for (const entry of journalEntries) {
          if (fromBound && entry.entry_date < fromBound) continue;
          if (toBound && entry.entry_date > toBound) continue;
          for (const line of entry.journal_entry_lines) {
            if (line.chart_of_accounts?.code === code) {
              debit += line.debit;
              credit += line.credit;
            }
          }
        }
        return { debit, credit };
      }

      // Compte de résultat sur la période choisie.
      const produitsPeriode =
        accountTotals("701", startDate, endDate).credit -
        accountTotals("701", startDate, endDate).debit;
      const chargesPeriode =
        accountTotals("601", startDate, endDate).debit -
        accountTotals("601", startDate, endDate).credit;
      const variationStock = stockEnd.total - stockStart.total;
      const resultatNetPeriode = produitsPeriode - chargesPeriode + variationStock;

      // Bilan : soldes cumulés depuis toujours jusqu'à la date de fin choisie.
      const clientsSolde =
        accountTotals("411", undefined, endDate).debit -
        accountTotals("411", undefined, endDate).credit;
      const fournisseursSolde =
        accountTotals("401", undefined, endDate).credit -
        accountTotals("401", undefined, endDate).debit;
      const tresorerieSolde =
        accountTotals("521", undefined, endDate).debit -
        accountTotals("521", undefined, endDate).credit;
      const tvaCollecteeSolde =
        accountTotals("4431", undefined, endDate).credit -
        accountTotals("4431", undefined, endDate).debit;
      const tvaDeductibleSolde =
        accountTotals("4452", undefined, endDate).debit -
        accountTotals("4452", undefined, endDate).credit;
      const tvaNette = tvaCollecteeSolde - tvaDeductibleSolde; // > 0 : à payer (passif) ; < 0 : créance (actif)

      const actif = {
        stock: stockEnd.total,
        clients: clientsSolde,
        tvaCreance: tvaNette < 0 ? -tvaNette : 0,
        tresorerie: tresorerieSolde,
      };
      const totalActif = actif.stock + actif.clients + actif.tvaCreance + actif.tresorerie;

      const capitalSocial = companyRes.data?.capital_social ?? 0;
      const fournisseurs = fournisseursSolde;
      const tvaAPayer = tvaNette > 0 ? tvaNette : 0;
      // Capitaux propres totaux = ce qu'il faut pour équilibrer le bilan (Actif − Dettes).
      // Le capital social saisi manuellement est une reclassification à l'intérieur de ce
      // total (aucun apport de trésorerie réel n'est tracé dans le grand livre) : le
      // "Résultat cumulé" affiché est donc le résidu, pas une valeur calculée séparément.
      const capitauxPropresTotal = totalActif - fournisseurs - tvaAPayer;
      const resultatCumule = capitauxPropresTotal - capitalSocial;

      const passif = { fournisseurs, tvaAPayer, capitalSocial, resultatCumule };
      const totalPassif = fournisseurs + tvaAPayer + capitalSocial + resultatCumule;

      // Analyse financière.
      const days = Math.max(
        1,
        Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000) + 1,
      );
      const margeCommerciale =
        produitsPeriode > 0 ? (resultatNetPeriode / produitsPeriode) * 100 : null;
      const autonomieFinanciere =
        totalPassif > 0 ? (capitauxPropresTotal / totalPassif) * 100 : null;
      const passifCirculant = fournisseurs + tvaAPayer;
      const liquiditeGenerale =
        passifCirculant > 0
          ? (actif.stock + actif.clients + actif.tresorerie) / passifCirculant
          : null;
      const delaiReglementClients =
        produitsPeriode > 0 ? (clientsSolde / produitsPeriode) * days : null;

      return {
        capitalSocial,
        incomeStatement: {
          produits: produitsPeriode,
          charges: chargesPeriode,
          variationStock,
          resultatNet: resultatNetPeriode,
        },
        balanceSheet: { actif, totalActif, passif, totalPassif },
        ratios: {
          resultatNetPeriode,
          margeCommerciale,
          autonomieFinanciere,
          liquiditeGenerale,
          delaiReglementClients,
        },
        unvaluedStock: stockEnd.unvalued,
      };
    },
  });
}
