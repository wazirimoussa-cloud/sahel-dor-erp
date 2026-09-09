// Valorisation du stock au CUMP (coût unitaire moyen pondéré) et rotation des stocks --
// extrait de useFinancialStatements.ts (computeFinancialStatements) pour être réutilisable
// par un hook plus léger (useStockRotation.ts) qui n'a pas besoin du journal comptable ni
// des immobilisations. Fonctions pures, mêmes calculs qu'avant l'extraction --
// tests/unit/computeFinancialStatements.test.ts continue de garantir la non-régression.

export interface StockValuationInput {
  products: { id: string; name: string; unit: string }[];
  purchaseLots: { product_id: string; quantity_received: number; unit_cost: number }[];
  transactions: { product_id: string; type: string; quantity: number; created_at: string }[];
}

export interface StockSnapshot {
  total: number;
  unvalued: { productId: string; name: string; quantity: number; unit: string }[];
}

// CUMP global par produit, à partir des lots créés par une réception d'achat --
// stock_lots.unit_cost porte le prix de revient du produit, fixé une fois pour toutes à sa
// création (voir migration 0075), pas le prix d'achat brut de cet achat précis. D'anciens
// lots (avant 0075) gardent leur coût atterri prorata d'origine, jamais réécrit -- la
// moyenne mélange donc les deux historiquement, cohérent avec le principe d'immuabilité du
// projet.
export function buildUnitCostMap(
  purchaseLots: StockValuationInput["purchaseLots"],
): Map<string, number> {
  const cump = new Map<string, { qty: number; cost: number }>();
  for (const lot of purchaseLots) {
    const entry = cump.get(lot.product_id) ?? { qty: 0, cost: 0 };
    entry.qty += lot.quantity_received;
    entry.cost += lot.quantity_received * lot.unit_cost;
    cump.set(lot.product_id, entry);
  }
  return new Map([...cump].map(([productId, { qty, cost }]) => [productId, qty > 0 ? cost / qty : 0]));
}

// Valorisation du stock à une date donnée : rejoue les transactions jusqu'à cette date,
// valorise au CUMP déjà construit.
export function stockValueAsOf(
  input: Pick<StockValuationInput, "products" | "transactions">,
  unitCostByProduct: Map<string, number>,
  dateIso: string,
): StockSnapshot {
  const productNameById = new Map(input.products.map((p) => [p.id, p.name]));
  const productUnitById = new Map(input.products.map((p) => [p.id, p.unit]));
  const bound = `${dateIso}T23:59:59.999`;
  const qtyByProduct = new Map<string, number>();
  for (const t of input.transactions) {
    if (t.created_at > bound) continue;
    const delta = t.type === "IN" ? t.quantity : t.type === "OUT" ? -t.quantity : t.quantity;
    qtyByProduct.set(t.product_id, (qtyByProduct.get(t.product_id) ?? 0) + delta);
  }
  let total = 0;
  const unvalued: StockSnapshot["unvalued"] = [];
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

// Nombre de jours inclusif entre deux dates ISO (ex. 2026-01-01 → 2026-01-31 = 31 jours) --
// même formule utilisée pour le délai de règlement clients et la rotation des stocks.
export function daysBetweenInclusive(startDate: string, endDate: string): number {
  return Math.max(
    1,
    Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000) + 1,
  );
}

export interface StockRotationResult {
  rotationStock: number | null;
  rotationStockJours: number | null;
}

// Coût des sorties sur la période (valorisées au même CUMP) rapporté à la valeur moyenne du
// stock (stockStart/stockEnd déjà calculés par l'appelant via stockValueAsOf) -- `null`
// plutôt que 0 quand le dénominateur est nul, même convention que les autres ratios
// financiers de ce projet (jamais un 0 par défaut qui laisserait croire à une vraie mesure).
export function computeStockRotation(
  transactions: StockValuationInput["transactions"],
  unitCostByProduct: Map<string, number>,
  startDate: string,
  endDate: string,
  stockStart: StockSnapshot,
  stockEnd: StockSnapshot,
  days: number,
): StockRotationResult {
  const startBound = `${startDate}T00:00:00.000`;
  const endBound = `${endDate}T23:59:59.999`;
  let coutSortiesPeriode = 0;
  for (const t of transactions) {
    if (t.type !== "OUT") continue;
    if (t.created_at < startBound || t.created_at > endBound) continue;
    coutSortiesPeriode += t.quantity * (unitCostByProduct.get(t.product_id) ?? 0);
  }
  const stockMoyen = (stockStart.total + stockEnd.total) / 2;
  return {
    rotationStock: stockMoyen > 0 ? coutSortiesPeriode / stockMoyen : null,
    rotationStockJours:
      stockMoyen > 0 && coutSortiesPeriode > 0 ? (stockMoyen / coutSortiesPeriode) * days : null,
  };
}
