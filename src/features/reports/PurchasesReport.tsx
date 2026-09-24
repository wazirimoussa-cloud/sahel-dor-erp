import { useState } from "react";
import { usePurchasesReport } from "@/features/reports/usePurchasesReport";
import { useActiveSuppliers } from "@/features/suppliers/useSuppliers";
import { useAllWarehouses } from "@/features/warehouses/useWarehouses";
import { Card } from "@/components/ui/Card";
import { ReportDateRangeFilter } from "@/components/reports/ReportDateRangeFilter";
import { ReportExportButton } from "@/components/reports/ReportExportButton";
import { PURCHASE_STATUS_LABELS, PURCHASE_STATUS_CLASSES } from "@/lib/purchaseDisplay";
import { computeVatBreakdown } from "@/lib/vat";
import { formatNumber } from "@/lib/format";
import { exportRowsToExcel } from "@/lib/xlsx";
import type { PurchaseStatus } from "@/lib/database.types";

export function PurchasesReport() {
  const { data: suppliers } = useActiveSuppliers();
  const { data: warehouses } = useAllWarehouses();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [status, setStatus] = useState<"" | PurchaseStatus>("");

  const { data: purchases, isLoading, error } = usePurchasesReport({
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    supplierId: supplierId || undefined,
    warehouseId: warehouseId || undefined,
    status: status || undefined,
  });

  function rows() {
    return (purchases ?? []).map((purchase) => {
      const supplierRelation = purchase.suppliers as { name: string } | { name: string }[] | null;
      const supplierName = Array.isArray(supplierRelation) ? supplierRelation[0]?.name : supplierRelation?.name;
      const warehouseRelation = purchase.warehouses as { name: string } | { name: string }[] | null;
      const warehouseName = Array.isArray(warehouseRelation) ? warehouseRelation[0]?.name : warehouseRelation?.name;
      const companyRelation = purchase.companies as
        | { vat_rate: number; vat_reduced_rate: number }
        | { vat_rate: number; vat_reduced_rate: number }[]
        | null;
      const company = Array.isArray(companyRelation) ? companyRelation[0] : companyRelation;
      const items = purchase.purchase_items as {
        quantity: number;
        unit_cost: number;
        products: { vat_exempt: boolean; vat_reduced: boolean } | { vat_exempt: boolean; vat_reduced: boolean }[] | null;
      }[];
      const { totalHT, totalTTC } = computeVatBreakdown(
        items.map((item) => {
          const productInfo = Array.isArray(item.products) ? item.products[0] : item.products;
          return {
            quantity: item.quantity,
            unitPrice: item.unit_cost,
            vatExempt: productInfo?.vat_exempt ?? false,
            vatReduced: productInfo?.vat_reduced ?? false,
          };
        }),
        company?.vat_rate ?? 0,
        company?.vat_reduced_rate ?? 0,
      );
      return {
        id: purchase.id,
        date: purchase.created_at,
        supplierName: supplierName ?? "—",
        warehouseName: warehouseName ?? "—",
        status: purchase.status,
        lignes: items.length,
        totalHT,
        totalTTC,
      };
    });
  }

  async function handleExportExcel() {
    await exportRowsToExcel(
      `etat-achats-${new Date().toISOString().slice(0, 10)}.xlsx`,
      [
        { header: "Date", key: "date" },
        { header: "Fournisseur", key: "fournisseur" },
        { header: "Magasin", key: "magasin" },
        { header: "Statut", key: "statut" },
        { header: "Lignes", key: "lignes" },
        { header: "Total HT (FCFA)", key: "totalHT" },
        { header: "Total TTC (FCFA)", key: "totalTTC" },
      ],
      rows().map((r) => ({
        date: new Date(r.date).toLocaleString("fr-FR"),
        fournisseur: r.supplierName,
        magasin: r.warehouseName,
        statut: PURCHASE_STATUS_LABELS[r.status] ?? r.status,
        lignes: r.lignes,
        totalHT: Math.round(r.totalHT),
        totalTTC: Math.round(r.totalTTC),
      })),
    );
  }

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-800">Achats</h2>
        <ReportExportButton onExport={handleExportExcel} disabled={!purchases || purchases.length === 0} />
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <ReportDateRangeFilter
          idPrefix="purchases-report"
          startDate={dateFrom}
          endDate={dateTo}
          onStartDateChange={setDateFrom}
          onEndDateChange={setDateTo}
        />
        <div>
          <label htmlFor="purchases-report-supplierId" className="mb-1 block text-xs font-medium text-gray-600">
            Fournisseur
          </label>
          <select
            id="purchases-report-supplierId"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
          >
            <option value="">Tous les fournisseurs</option>
            {suppliers?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="purchases-report-warehouseId" className="mb-1 block text-xs font-medium text-gray-600">
            Magasin
          </label>
          <select
            id="purchases-report-warehouseId"
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
          <label htmlFor="purchases-report-status" className="mb-1 block text-xs font-medium text-gray-600">
            Statut
          </label>
          <select
            id="purchases-report-status"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            value={status}
            onChange={(e) => setStatus(e.target.value as "" | PurchaseStatus)}
          >
            <option value="">Tous</option>
            <option value="pending">En attente</option>
            <option value="received">Reçu</option>
            <option value="cancelled">Annulé</option>
          </select>
        </div>
      </div>

      {isLoading && <p className="text-sm text-gray-500">Chargement…</p>}
      {error && <p className="text-sm text-red-600">Impossible de charger les bons d'achat.</p>}
      {purchases && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th scope="col" className="py-2 pr-3">Date</th>
                <th scope="col" className="py-2 pr-3">Fournisseur</th>
                <th scope="col" className="py-2 pr-3">Magasin</th>
                <th scope="col" className="py-2 pr-3">Statut</th>
                <th scope="col" className="py-2 pr-3">Lignes</th>
                <th scope="col" className="py-2 pr-3">Total HT</th>
                <th scope="col" className="py-2">Total TTC</th>
              </tr>
            </thead>
            <tbody>
              {rows().map((r) => (
                <tr key={r.id} className="border-b border-gray-100">
                  <td className="py-2 pr-3">{new Date(r.date).toLocaleString("fr-FR")}</td>
                  <td className="py-2 pr-3">{r.supplierName}</td>
                  <td className="py-2 pr-3">{r.warehouseName}</td>
                  <td className="py-2 pr-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PURCHASE_STATUS_CLASSES[r.status] ?? ""}`}>
                      {PURCHASE_STATUS_LABELS[r.status] ?? r.status}
                    </span>
                  </td>
                  <td className="py-2 pr-3">{r.lignes}</td>
                  <td className="py-2 pr-3">{formatNumber(Math.round(r.totalHT))} FCFA</td>
                  <td className="py-2">{formatNumber(Math.round(r.totalTTC))} FCFA</td>
                </tr>
              ))}
              {rows().length === 0 && (
                <tr>
                  <td colSpan={7} className="py-4 text-center text-gray-500">
                    Aucun bon d'achat trouvé pour ces filtres.
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
