import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { TransactionType } from "@/lib/database.types";

export interface StockMovementFilters {
  dateFrom?: string;
  dateTo?: string;
  productId?: string;
  warehouseId?: string;
  direction?: "IN" | "OUT";
  lotNumber?: string;
  minAvailable?: number;
  expiryFrom?: string;
  expiryTo?: string;
  provenance?: string;
  destination?: string;
}

export interface StockMovementRow {
  key: string;
  createdAt: string;
  type: TransactionType;
  direction: "IN" | "OUT";
  productName: string;
  unit: string;
  warehouseName: string;
  lotNumber: number | null;
  quantity: number;
  availableStock: number | null;
  expiryDate: string | null;
  provenance: string;
  destination: string;
}

// Une transaction créée avant le déploiement de la migration 0037 (traçabilité par lot)
// n'a ni lot source ni allocation -- cas réel pour toute société déjà active avant cette
// migration, pas un cas limite. Ces mouvements retombent sur la ligne de repli ci-dessous
// (champs de lot vides) plutôt que d'être silencieusement exclus.
const NO_FILTER_RAW_LIMIT = 20;
const FILTERED_RAW_LIMIT = 2000;
const DEFAULT_ROW_COUNT = 10;

function one<T>(rel: T | T[] | null | undefined): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

function hasActiveFilter(filters: StockMovementFilters): boolean {
  return Object.values(filters).some((value) => value !== undefined && value !== "" && value !== null);
}

interface RawLot {
  id: string;
  lot_number: number;
  quantity_remaining: number;
  expiry_date: string | null;
}

interface RawTransaction {
  id: string;
  type: TransactionType;
  quantity: number;
  created_at: string;
  note: string | null;
  product_id: string;
  warehouse_id: string;
  purchase_id: string | null;
  production_id: string | null;
  transformation_id: string | null;
  order_id: string | null;
  transfer_group_id: string | null;
  products: { name: string; unit: string } | { name: string; unit: string }[] | null;
  warehouses: { name: string } | { name: string }[] | null;
  purchases:
    | { receipt_number: number; suppliers: { name: string } | { name: string }[] | null }
    | { receipt_number: number; suppliers: { name: string } | { name: string }[] | null }[]
    | null;
  orders:
    | { clients: { name: string } | { name: string }[] | null }
    | { clients: { name: string } | { name: string }[] | null }[]
    | null;
  source_lot: RawLot | RawLot[] | null;
  transaction_lot_allocations: { quantity: number; stock_lots: RawLot | RawLot[] | null }[] | null;
}

// Un mouvement à delta positif (IN, ou ADJUSTMENT positif) est bucketé "Entrée", un
// mouvement à delta négatif "Sortie" -- conforme au cadrage binaire demandé par le
// client. Le badge affiché ailleurs précise "(ajustement)" sans changer ce classement.
function directionOf(tx: RawTransaction): "IN" | "OUT" {
  if (tx.type === "IN") return "IN";
  if (tx.type === "OUT") return "OUT";
  return tx.quantity >= 0 ? "IN" : "OUT";
}

// Chaque mouvement renseigne soit Provenance (entrant) soit Destination (sortant),
// jamais les deux -- voir le tableau de dérivation dans le plan.
function deriveLabel(tx: RawTransaction, direction: "IN" | "OUT"): string {
  if (tx.purchase_id && direction === "IN") {
    const purchase = one(tx.purchases);
    const supplier = purchase ? one(purchase.suppliers) : null;
    return `Achat #${purchase?.receipt_number ?? "?"}${supplier ? ` — ${supplier.name}` : ""}`;
  }
  if (tx.production_id && direction === "IN") {
    return `Production #${tx.production_id.slice(0, 8)}`;
  }
  if (tx.transformation_id) {
    return `Transformation #${tx.transformation_id.slice(0, 8)}`;
  }
  if (tx.order_id && tx.type === "OUT") {
    const order = one(tx.orders);
    const client = order ? one(order.clients) : null;
    return `Commande #${tx.order_id.slice(0, 8)}${client ? ` — ${client.name}` : ""}`;
  }
  if (tx.order_id && tx.type === "ADJUSTMENT" && direction === "IN") {
    const order = one(tx.orders);
    const client = order ? one(order.clients) : null;
    return `Annulation commande #${tx.order_id.slice(0, 8)}${client ? ` — ${client.name}` : ""}`;
  }
  if (tx.transfer_group_id && tx.note) {
    return tx.note;
  }
  if (tx.note) {
    return tx.note;
  }
  return "Mouvement manuel";
}

function flatten(transactions: RawTransaction[]): StockMovementRow[] {
  const rows: StockMovementRow[] = [];

  for (const tx of transactions) {
    const product = one(tx.products);
    const warehouse = one(tx.warehouses);
    const direction = directionOf(tx);
    const label = deriveLabel(tx, direction);
    const sourceLot = one(tx.source_lot);
    const allocations = tx.transaction_lot_allocations ?? [];

    const base = {
      createdAt: tx.created_at,
      type: tx.type,
      direction,
      productName: product?.name ?? "—",
      unit: product?.unit ?? "",
      warehouseName: warehouse?.name ?? "—",
      provenance: direction === "IN" ? label : "—",
      destination: direction === "OUT" ? label : "—",
    };

    if (sourceLot) {
      rows.push({
        ...base,
        key: `${tx.id}-${sourceLot.id}`,
        lotNumber: sourceLot.lot_number,
        quantity: Math.abs(tx.quantity),
        availableStock: sourceLot.quantity_remaining,
        expiryDate: sourceLot.expiry_date,
      });
    } else if (allocations.length > 0) {
      allocations.forEach((allocation, index) => {
        const lot = one(allocation.stock_lots);
        rows.push({
          ...base,
          key: `${tx.id}-${lot?.id ?? index}`,
          lotNumber: lot?.lot_number ?? null,
          quantity: Math.abs(allocation.quantity),
          availableStock: lot?.quantity_remaining ?? null,
          expiryDate: lot?.expiry_date ?? null,
        });
      });
    } else {
      rows.push({
        ...base,
        key: tx.id,
        lotNumber: null,
        quantity: Math.abs(tx.quantity),
        availableStock: null,
        expiryDate: null,
      });
    }
  }

  return rows.sort((a, b) => {
    const byDate = b.createdAt.localeCompare(a.createdAt);
    if (byDate !== 0) return byDate;
    return (a.lotNumber ?? Infinity) - (b.lotNumber ?? Infinity);
  });
}

function matchesClientFilters(row: StockMovementRow, filters: StockMovementFilters): boolean {
  if (filters.direction && row.direction !== filters.direction) return false;
  if (filters.lotNumber && String(row.lotNumber ?? "") !== filters.lotNumber) return false;
  if (filters.minAvailable !== undefined) {
    if (row.availableStock === null || row.availableStock < filters.minAvailable) return false;
  }
  if (filters.expiryFrom && (!row.expiryDate || row.expiryDate < filters.expiryFrom)) return false;
  if (filters.expiryTo && (!row.expiryDate || row.expiryDate > filters.expiryTo)) return false;
  if (filters.provenance) {
    if (!row.provenance.toLowerCase().includes(filters.provenance.toLowerCase())) return false;
  }
  if (filters.destination) {
    if (!row.destination.toLowerCase().includes(filters.destination.toLowerCase())) return false;
  }
  return true;
}

const SELECT = `
  id, type, quantity, created_at, note,
  product_id, warehouse_id, purchase_id, production_id, transformation_id,
  order_id, transfer_group_id,
  products(name, unit),
  warehouses(name),
  purchases(receipt_number, suppliers(name)),
  orders(clients(name)),
  source_lot:stock_lots!source_transaction_id(id, lot_number, quantity_remaining, expiry_date),
  transaction_lot_allocations(quantity, stock_lots(id, lot_number, quantity_remaining, expiry_date))
`;

export function useStockMovements(filters: StockMovementFilters) {
  const filtered = hasActiveFilter(filters);

  return useQuery({
    queryKey: ["stock_movements", filters],
    queryFn: async () => {
      let query = supabase
        .from("transactions")
        .select(SELECT)
        .order("created_at", { ascending: false });

      if (filters.productId) query = query.eq("product_id", filters.productId);
      if (filters.warehouseId) query = query.eq("warehouse_id", filters.warehouseId);
      if (filters.dateFrom) query = query.gte("created_at", `${filters.dateFrom}T00:00:00.000`);
      if (filters.dateTo) query = query.lte("created_at", `${filters.dateTo}T23:59:59.999`);
      query = query.limit(filtered ? FILTERED_RAW_LIMIT : NO_FILTER_RAW_LIMIT);

      const { data, error } = await query;
      if (error) throw error;

      const flattened = flatten((data ?? []) as unknown as RawTransaction[]);
      if (!filtered) return flattened.slice(0, DEFAULT_ROW_COUNT);
      return flattened.filter((row) => matchesClientFilters(row, filters));
    },
  });
}
