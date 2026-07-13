import { Fragment, useMemo, useState } from "react";
import { useAuth } from "@/auth/useAuth";
import { useTransactions } from "@/features/stock/useTransactions";
import { useProductStocks } from "@/features/stock/useProductStocks";
import { StockMovementForm } from "@/features/stock/StockMovementForm";
import { TransferStockForm } from "@/features/stock/TransferStockForm";
import { Card } from "@/components/ui/Card";
import { isLowStock } from "@/lib/stockThreshold";

const TYPE_LABELS: Record<string, string> = {
  IN: "Entrée",
  OUT: "Sortie",
  ADJUSTMENT: "Ajustement",
};

interface ProductStockGroup {
  productId: string;
  productName: string;
  unit: string;
  total: number;
  byWarehouse: { warehouseName: string; stock: number }[];
}

export function StockPage() {
  const { profile } = useAuth();
  const { data: transactions, isLoading, error } = useTransactions();
  const {
    data: productStocks,
    isLoading: isLoadingStocks,
    error: stocksError,
  } = useProductStocks();
  const canRecord =
    profile?.role === "warehouse_manager" || profile?.role === "logistics_transport";

  const [productFilter, setProductFilter] = useState("all");
  const [warehouseFilter, setWarehouseFilter] = useState("all");

  const normalizedRows = useMemo(
    () =>
      (productStocks ?? []).flatMap((row) => {
        const product = row.products as
          | { id: string; name: string; unit: string }
          | { id: string; name: string; unit: string }[]
          | null;
        const productInfo = Array.isArray(product) ? product[0] : product;
        const warehouse = row.warehouses as
          { id: string; name: string } | { id: string; name: string }[] | null;
        const warehouseInfo = Array.isArray(warehouse) ? warehouse[0] : warehouse;
        if (!productInfo || !warehouseInfo) return [];
        return [{ product: productInfo, warehouse: warehouseInfo, stock: row.stock }];
      }),
    [productStocks],
  );

  const productOptions = useMemo(
    () =>
      [...new Map(normalizedRows.map((r) => [r.product.id, r.product])).values()].sort((a, b) =>
        a.name.localeCompare(b.name, "fr"),
      ),
    [normalizedRows],
  );
  const warehouseOptions = useMemo(
    () =>
      [...new Map(normalizedRows.map((r) => [r.warehouse.id, r.warehouse])).values()].sort((a, b) =>
        a.name.localeCompare(b.name, "fr"),
      ),
    [normalizedRows],
  );

  const filteredRows = normalizedRows.filter(
    (r) =>
      (productFilter === "all" || r.product.id === productFilter) &&
      (warehouseFilter === "all" || r.warehouse.id === warehouseFilter),
  );

  const stockGroups = new Map<string, ProductStockGroup>();
  for (const row of filteredRows) {
    const group = stockGroups.get(row.product.id) ?? {
      productId: row.product.id,
      productName: row.product.name,
      unit: row.product.unit,
      total: 0,
      byWarehouse: [],
    };
    group.total += row.stock;
    group.byWarehouse.push({ warehouseName: row.warehouse.name, stock: row.stock });
    stockGroups.set(row.product.id, group);
  }
  const sortedStockGroups = [...stockGroups.values()].sort((a, b) =>
    a.productName.localeCompare(b.productName, "fr"),
  );
  // Regroupé par unité plutôt qu'une somme unique : des tonnes et des cartons ne
  // s'additionnent pas entre eux.
  const totalsByUnit = new Map<string, number>();
  for (const row of filteredRows) {
    totalsByUnit.set(row.product.unit, (totalsByUnit.get(row.product.unit) ?? 0) + row.stock);
  }
  const grandTotalLabel = [...totalsByUnit.entries()]
    .map(([unit, total]) => `${total.toLocaleString("fr-FR")} ${unit}`)
    .join(" · ");

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-gray-800">Mouvements de stock</h1>

      {canRecord && (
        <Card>
          <StockMovementForm />
        </Card>
      )}

      {canRecord && (
        <Card>
          <h2 className="mb-3 text-base font-semibold text-gray-800">Transfert entre magasins</h2>
          <TransferStockForm />
        </Card>
      )}

      <Card>
        <h2 className="mb-3 text-base font-semibold text-gray-800">Synthèse du stock disponible</h2>
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Produit</label>
            <select
              className="rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              value={productFilter}
              onChange={(e) => setProductFilter(e.target.value)}
            >
              <option value="all">Tous les produits</option>
              {productOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Magasin</label>
            <select
              className="rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              value={warehouseFilter}
              onChange={(e) => setWarehouseFilter(e.target.value)}
            >
              <option value="all">Tous les magasins</option>
              {warehouseOptions.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {isLoadingStocks && <p className="text-sm text-gray-500">Chargement…</p>}
        {stocksError && (
          <p className="text-sm text-red-600">Impossible de charger la synthèse du stock.</p>
        )}
        {productStocks && (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="py-2">Produit</th>
                <th className="py-2">Magasin</th>
                <th className="py-2">Stock disponible</th>
              </tr>
            </thead>
            <tbody>
              {sortedStockGroups.map((group) => (
                <Fragment key={group.productId}>
                  <tr className="border-b border-gray-100 bg-gray-50 font-medium">
                    <td className="py-2" colSpan={2}>
                      {group.productName}
                    </td>
                    <td
                      className={`py-2 ${isLowStock(group.total, group.unit) ? "text-red-600" : ""}`}
                    >
                      {group.total} {group.unit}
                    </td>
                  </tr>
                  {group.byWarehouse.map((w) => (
                    <tr
                      key={`${group.productId}-${w.warehouseName}`}
                      className="border-b border-gray-100 text-gray-500"
                    >
                      <td className="py-1"></td>
                      <td className="py-1 pl-2">{w.warehouseName}</td>
                      <td className="py-1">
                        {w.stock} {group.unit}
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
              {sortedStockGroups.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-4 text-center text-gray-400">
                    Aucun stock pour cette sélection.
                  </td>
                </tr>
              )}
            </tbody>
            {sortedStockGroups.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gray-300 font-semibold text-gray-800">
                  <td className="py-2" colSpan={2}>
                    Total restant
                  </td>
                  <td className="py-2">{grandTotalLabel}</td>
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </Card>

      <Card>
        {isLoading && <p className="text-sm text-gray-500">Chargement…</p>}
        {error && <p className="text-sm text-red-600">Impossible de charger les mouvements.</p>}
        {transactions && (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="py-2">Date</th>
                <th className="py-2">Produit</th>
                <th className="py-2">Magasin</th>
                <th className="py-2">Type</th>
                <th className="py-2">Quantité</th>
                <th className="py-2">Provenance / Destination</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => {
                const product = tx.products as
                  { name: string; unit: string } | { name: string; unit: string }[] | null;
                const productInfo = Array.isArray(product) ? product[0] : product;
                const warehouse = tx.warehouses as { name: string } | { name: string }[] | null;
                const warehouseName = Array.isArray(warehouse)
                  ? warehouse[0]?.name
                  : warehouse?.name;
                return (
                  <tr key={tx.id} className="border-b border-gray-100">
                    <td className="py-2">{new Date(tx.created_at).toLocaleString("fr-FR")}</td>
                    <td className="py-2">{productInfo?.name ?? "—"}</td>
                    <td className="py-2">{warehouseName ?? "—"}</td>
                    <td className="py-2">{TYPE_LABELS[tx.type] ?? tx.type}</td>
                    <td className="py-2">
                      {tx.quantity} {productInfo?.unit ?? ""}
                    </td>
                    <td className="py-2 text-gray-500">{tx.note ?? "—"}</td>
                  </tr>
                );
              })}
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-gray-400">
                    Aucun mouvement enregistré.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
