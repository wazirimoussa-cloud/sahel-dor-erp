import { useState } from "react";
import { useStockLossesReport } from "@/features/reports/useStockLossesReport";
import { useAllProducts } from "@/features/products/useProducts";
import { useAllWarehouses } from "@/features/warehouses/useWarehouses";
import { Card } from "@/components/ui/Card";
import { ReportDateRangeFilter } from "@/components/reports/ReportDateRangeFilter";
import { ReportExportButton } from "@/components/reports/ReportExportButton";
import { exportRowsToExcel } from "@/lib/xlsx";

const STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  approved: "Approuvée",
  rejected: "Rejetée",
};

const STATUS_CLASSES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

export function StockLossesReport() {
  const { data: products } = useAllProducts();
  const { data: warehouses } = useAllWarehouses();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [productId, setProductId] = useState("");
  const [status, setStatus] = useState("");

  const { data: requests, isLoading, error } = useStockLossesReport({
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    warehouseId: warehouseId || undefined,
    productId: productId || undefined,
    status: status || undefined,
  });

  function rows() {
    return (requests ?? []).map((r) => {
      const productRelation = r.products as { name: string; unit: string } | { name: string; unit: string }[] | null;
      const product = Array.isArray(productRelation) ? productRelation[0] : productRelation;
      const warehouseRelation = r.warehouses as { name: string } | { name: string }[] | null;
      const warehouseName = Array.isArray(warehouseRelation) ? warehouseRelation[0]?.name : warehouseRelation?.name;
      const requesterRelation = r.requester as { email: string } | { email: string }[] | null;
      const requesterEmail = Array.isArray(requesterRelation) ? requesterRelation[0]?.email : requesterRelation?.email;
      return {
        id: r.id,
        date: r.created_at,
        productName: product?.name ?? "—",
        unit: product?.unit ?? "",
        warehouseName: warehouseName ?? "—",
        quantity: r.quantity,
        reason: r.reason,
        status: r.status,
        requesterEmail: requesterEmail ?? "—",
      };
    });
  }

  async function handleExportExcel() {
    await exportRowsToExcel(
      `etat-pertes-stock-${new Date().toISOString().slice(0, 10)}.xlsx`,
      [
        { header: "Date", key: "date" },
        { header: "Produit", key: "produit" },
        { header: "Magasin", key: "magasin" },
        { header: "Quantité", key: "quantite" },
        { header: "Motif", key: "motif" },
        { header: "Statut", key: "statut" },
        { header: "Demandeur", key: "demandeur" },
      ],
      rows().map((r) => ({
        date: new Date(r.date).toLocaleString("fr-FR"),
        produit: r.productName,
        magasin: r.warehouseName,
        quantite: `${r.quantity} ${r.unit}`.trim(),
        motif: r.reason,
        statut: STATUS_LABELS[r.status] ?? r.status,
        demandeur: r.requesterEmail,
      })),
    );
  }

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-800">Pertes de stock</h2>
        <ReportExportButton onExport={handleExportExcel} disabled={!requests || requests.length === 0} />
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <ReportDateRangeFilter
          idPrefix="stock-losses-report"
          startDate={dateFrom}
          endDate={dateTo}
          onStartDateChange={setDateFrom}
          onEndDateChange={setDateTo}
        />
        <div>
          <label htmlFor="stock-losses-report-productId" className="mb-1 block text-xs font-medium text-gray-600">
            Produit
          </label>
          <select
            id="stock-losses-report-productId"
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
          <label htmlFor="stock-losses-report-warehouseId" className="mb-1 block text-xs font-medium text-gray-600">
            Magasin
          </label>
          <select
            id="stock-losses-report-warehouseId"
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
          <label htmlFor="stock-losses-report-status" className="mb-1 block text-xs font-medium text-gray-600">
            Statut
          </label>
          <select
            id="stock-losses-report-status"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Tous</option>
            <option value="pending">En attente</option>
            <option value="approved">Approuvée</option>
            <option value="rejected">Rejetée</option>
          </select>
        </div>
      </div>

      {isLoading && <p className="text-sm text-gray-500">Chargement…</p>}
      {error && <p className="text-sm text-red-600">Impossible de charger les pertes de stock.</p>}
      {requests && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th scope="col" className="py-2 pr-3">Date</th>
                <th scope="col" className="py-2 pr-3">Produit</th>
                <th scope="col" className="py-2 pr-3">Magasin</th>
                <th scope="col" className="py-2 pr-3">Quantité</th>
                <th scope="col" className="py-2 pr-3">Motif</th>
                <th scope="col" className="py-2 pr-3">Statut</th>
                <th scope="col" className="py-2">Demandeur</th>
              </tr>
            </thead>
            <tbody>
              {rows().map((r) => (
                <tr key={r.id} className="border-b border-gray-100">
                  <td className="py-2 pr-3">{new Date(r.date).toLocaleString("fr-FR")}</td>
                  <td className="py-2 pr-3">{r.productName}</td>
                  <td className="py-2 pr-3">{r.warehouseName}</td>
                  <td className="py-2 pr-3">
                    {r.quantity} {r.unit}
                  </td>
                  <td className="py-2 pr-3 text-gray-500">{r.reason}</td>
                  <td className="py-2 pr-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[r.status] ?? ""}`}>
                      {STATUS_LABELS[r.status] ?? r.status}
                    </span>
                  </td>
                  <td className="py-2">{r.requesterEmail}</td>
                </tr>
              ))}
              {rows().length === 0 && (
                <tr>
                  <td colSpan={7} className="py-4 text-center text-gray-500">
                    Aucune perte de stock trouvée pour ces filtres.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
