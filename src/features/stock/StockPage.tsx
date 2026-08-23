import { useState } from "react";
import { useAuth } from "@/auth/useAuth";
import { useStockMovements, type StockMovementFilters } from "@/features/stock/useStockMovements";
import { useAllProducts } from "@/features/products/useProducts";
import { useAllWarehouses } from "@/features/warehouses/useWarehouses";
import { StockMovementForm } from "@/features/stock/StockMovementForm";
import { TransferStockForm } from "@/features/stock/TransferStockForm";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { movementDirectionLabel, lotStatus } from "@/lib/stockDisplay";
import { formatNumber } from "@/lib/format";
import { exportRowsToExcel } from "@/lib/xlsx";

export function StockPage() {
  const { hasAttribution } = useAuth();
  const canRecordMovement = hasAttribution("stock.mouvement_manuel");
  const canTransfer = hasAttribution("stock.transfert");

  const { data: products } = useAllProducts();
  const { data: warehouses } = useAllWarehouses();

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [lotNumber, setLotNumber] = useState("");
  const [productId, setProductId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [direction, setDirection] = useState<"" | "IN" | "OUT">("");
  const [minAvailable, setMinAvailable] = useState("");
  const [expiryFrom, setExpiryFrom] = useState("");
  const [expiryTo, setExpiryTo] = useState("");
  const [provenance, setProvenance] = useState("");
  const [destination, setDestination] = useState("");

  const filters: StockMovementFilters = {
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    lotNumber: lotNumber || undefined,
    productId: productId || undefined,
    warehouseId: warehouseId || undefined,
    direction: direction || undefined,
    minAvailable: minAvailable !== "" ? Number(minAvailable) : undefined,
    expiryFrom: expiryFrom || undefined,
    expiryTo: expiryTo || undefined,
    provenance: provenance || undefined,
    destination: destination || undefined,
  };
  const isFiltered = Object.values(filters).some((value) => value !== undefined);

  const { data: movements, isLoading, error } = useStockMovements(filters);

  function resetFilters() {
    setDateFrom("");
    setDateTo("");
    setLotNumber("");
    setProductId("");
    setWarehouseId("");
    setDirection("");
    setMinAvailable("");
    setExpiryFrom("");
    setExpiryTo("");
    setProvenance("");
    setDestination("");
  }

  async function handleExportExcel() {
    if (!movements) return;
    await exportRowsToExcel(
      `mouvements-de-stock-${new Date().toISOString().slice(0, 10)}.xlsx`,
      [
        { header: "Date", key: "date" },
        { header: "Lot", key: "lot" },
        { header: "Produit", key: "produit" },
        { header: "Magasin", key: "magasin" },
        { header: "Type", key: "type" },
        { header: "Quantité", key: "quantite" },
        { header: "Stock disponible", key: "stockDisponible" },
        { header: "Date de péremption", key: "peremption" },
        { header: "Provenance", key: "provenance" },
        { header: "Destination", key: "destination" },
      ],
      movements.map((row) => ({
        date: new Date(row.createdAt).toLocaleString("fr-FR"),
        lot: row.lotNumber !== null ? `Lot #${row.lotNumber}` : "—",
        produit: row.productName,
        magasin: row.warehouseName,
        type: movementDirectionLabel(row.direction, row.type === "ADJUSTMENT"),
        quantite: `${row.quantity} ${row.unit}`.trim(),
        stockDisponible: row.availableStock !== null ? `${row.availableStock} ${row.unit}`.trim() : "—",
        peremption: row.expiryDate ? new Date(row.expiryDate).toLocaleDateString("fr-FR") : "—",
        provenance: row.provenance,
        destination: row.destination,
      })),
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-bold text-forest-900">Mouvements de stock</h1>

      {canRecordMovement && (
        <Card>
          <StockMovementForm />
        </Card>
      )}

      {canTransfer && (
        <Card>
          <h2 className="mb-3 text-base font-semibold text-gray-800">Transfert entre magasins</h2>
          <TransferStockForm />
        </Card>
      )}

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-gray-800">Synthèse du stock disponible</h2>
          <Button
            type="button"
            variant="secondary"
            disabled={!movements || movements.length === 0}
            onClick={() => void handleExportExcel()}
          >
            Exporter en Excel
          </Button>
        </div>

        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="mv-dateFrom" className="mb-1 block text-xs font-medium text-gray-600">
              Depuis le
            </label>
            <Input id="mv-dateFrom" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label htmlFor="mv-dateTo" className="mb-1 block text-xs font-medium text-gray-600">
              Jusqu'au
            </label>
            <Input id="mv-dateTo" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div>
            <label htmlFor="mv-lotNumber" className="mb-1 block text-xs font-medium text-gray-600">
              Lot n°
            </label>
            <Input
              id="mv-lotNumber"
              type="number"
              className="w-24"
              value={lotNumber}
              onChange={(e) => setLotNumber(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="mv-productId" className="mb-1 block text-xs font-medium text-gray-600">
              Produit
            </label>
            <select
              id="mv-productId"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
            >
              <option value="">Tous les produits</option>
              {products?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="mv-warehouseId" className="mb-1 block text-xs font-medium text-gray-600">
              Magasin
            </label>
            <select
              id="mv-warehouseId"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
            >
              <option value="">Tous les magasins</option>
              {warehouses?.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="mv-direction" className="mb-1 block text-xs font-medium text-gray-600">
              Type de mouvement
            </label>
            <select
              id="mv-direction"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              value={direction}
              onChange={(e) => setDirection(e.target.value as "" | "IN" | "OUT")}
            >
              <option value="">Tous</option>
              <option value="IN">Entrée</option>
              <option value="OUT">Sortie</option>
            </select>
          </div>
          <div>
            <label htmlFor="mv-minAvailable" className="mb-1 block text-xs font-medium text-gray-600">
              Stock disponible ≥
            </label>
            <Input
              id="mv-minAvailable"
              type="number"
              step="0.001"
              className="w-28"
              value={minAvailable}
              onChange={(e) => setMinAvailable(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="mv-expiryFrom" className="mb-1 block text-xs font-medium text-gray-600">
              Péremption depuis
            </label>
            <Input
              id="mv-expiryFrom"
              type="date"
              value={expiryFrom}
              onChange={(e) => setExpiryFrom(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="mv-expiryTo" className="mb-1 block text-xs font-medium text-gray-600">
              Péremption jusqu'au
            </label>
            <Input id="mv-expiryTo" type="date" value={expiryTo} onChange={(e) => setExpiryTo(e.target.value)} />
          </div>
          <div>
            <label htmlFor="mv-provenance" className="mb-1 block text-xs font-medium text-gray-600">
              Provenance
            </label>
            <Input
              id="mv-provenance"
              type="text"
              className="w-40"
              value={provenance}
              onChange={(e) => setProvenance(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="mv-destination" className="mb-1 block text-xs font-medium text-gray-600">
              Destination
            </label>
            <Input
              id="mv-destination"
              type="text"
              className="w-40"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={resetFilters}
            className="text-sm text-gray-500 hover:text-gray-700 hover:underline"
          >
            Réinitialiser
          </button>
        </div>

        <p className="mb-3 text-xs text-gray-500">
          {isFiltered
            ? "Tous les mouvements correspondant aux filtres."
            : "Les 10 derniers mouvements enregistrés — appliquez un filtre pour voir l'ensemble des résultats correspondants."}
        </p>

        {isLoading && <p className="text-sm text-gray-500">Chargement…</p>}
        {error && (
          <p className="text-sm text-red-600">Impossible de charger les mouvements de stock.</p>
        )}
        {movements && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  <th scope="col" className="py-2 pr-3">Date</th>
                  <th scope="col" className="py-2 pr-3">Lot</th>
                  <th scope="col" className="py-2 pr-3">Produit</th>
                  <th scope="col" className="py-2 pr-3">Magasin</th>
                  <th scope="col" className="py-2 pr-3">Type</th>
                  <th scope="col" className="py-2 pr-3">Quantité</th>
                  <th scope="col" className="py-2 pr-3">Stock disponible</th>
                  <th scope="col" className="py-2 pr-3">Péremption</th>
                  <th scope="col" className="py-2 pr-3">Provenance</th>
                  <th scope="col" className="py-2">Destination</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((row) => {
                  const status = lotStatus(row.expiryDate);
                  return (
                    <tr key={row.key} className="border-b border-gray-100">
                      <td className="py-2 pr-3">{new Date(row.createdAt).toLocaleString("fr-FR")}</td>
                      <td className="py-2 pr-3">{row.lotNumber !== null ? `Lot #${row.lotNumber}` : "—"}</td>
                      <td className="py-2 pr-3">{row.productName}</td>
                      <td className="py-2 pr-3">{row.warehouseName}</td>
                      <td className="py-2 pr-3">
                        {movementDirectionLabel(row.direction, row.type === "ADJUSTMENT")}
                      </td>
                      <td className="py-2 pr-3">
                        {formatNumber(row.quantity)} {row.unit}
                      </td>
                      <td className="py-2 pr-3">
                        {row.availableStock !== null ? `${formatNumber(row.availableStock)} ${row.unit}` : "—"}
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          {row.expiryDate ? new Date(row.expiryDate).toLocaleDateString("fr-FR") : "—"}
                          {status && (
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}
                            >
                              {status.label}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-gray-500">{row.provenance}</td>
                      <td className="py-2 text-gray-500">{row.destination}</td>
                    </tr>
                  );
                })}
                {movements.length === 0 && (
                  <tr>
                    <td colSpan={10} className="py-4 text-center text-gray-500">
                      Aucun mouvement pour cette sélection.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
