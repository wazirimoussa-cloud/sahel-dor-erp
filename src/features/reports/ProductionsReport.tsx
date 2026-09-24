import { useState } from "react";
import { useProductionsReport } from "@/features/reports/useProductionsReport";
import { useAllWarehouses } from "@/features/warehouses/useWarehouses";
import { Card } from "@/components/ui/Card";
import { ReportDateRangeFilter } from "@/components/reports/ReportDateRangeFilter";
import { ReportExportButton } from "@/components/reports/ReportExportButton";
import { formatNumber } from "@/lib/format";
import { exportRowsToExcel } from "@/lib/xlsx";

export function ProductionsReport() {
  const { data: warehouses } = useAllWarehouses();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [warehouseId, setWarehouseId] = useState("");

  const { data: productions, isLoading, error } = useProductionsReport({
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    warehouseId: warehouseId || undefined,
  });

  function rows() {
    return (productions ?? []).map((p) => {
      const warehouseRelation = p.warehouses as { name: string } | { name: string }[] | null;
      const warehouseName = Array.isArray(warehouseRelation) ? warehouseRelation[0]?.name : warehouseRelation?.name;
      const items = p.production_items as { quantity: number; unit_cost: number }[];
      const value = items.reduce((sum, item) => sum + item.quantity * item.unit_cost, 0);
      return { id: p.id, date: p.created_at, warehouseName: warehouseName ?? "—", lignes: items.length, value };
    });
  }

  async function handleExportExcel() {
    await exportRowsToExcel(
      `etat-production-${new Date().toISOString().slice(0, 10)}.xlsx`,
      [
        { header: "Date", key: "date" },
        { header: "Magasin", key: "magasin" },
        { header: "Lignes", key: "lignes" },
        { header: "Valeur (FCFA)", key: "valeur" },
      ],
      rows().map((r) => ({
        date: new Date(r.date).toLocaleString("fr-FR"),
        magasin: r.warehouseName,
        lignes: r.lignes,
        valeur: Math.round(r.value),
      })),
    );
  }

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-800">Production</h2>
        <ReportExportButton onExport={handleExportExcel} disabled={!productions || productions.length === 0} />
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <ReportDateRangeFilter
          idPrefix="productions-report"
          startDate={dateFrom}
          endDate={dateTo}
          onStartDateChange={setDateFrom}
          onEndDateChange={setDateTo}
        />
        <div>
          <label htmlFor="productions-report-warehouseId" className="mb-1 block text-xs font-medium text-gray-600">
            Magasin
          </label>
          <select
            id="productions-report-warehouseId"
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
      </div>

      {isLoading && <p className="text-sm text-gray-500">Chargement…</p>}
      {error && <p className="text-sm text-red-600">Impossible de charger les productions.</p>}
      {productions && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th scope="col" className="py-2 pr-3">Date</th>
                <th scope="col" className="py-2 pr-3">Magasin</th>
                <th scope="col" className="py-2 pr-3">Lignes</th>
                <th scope="col" className="py-2">Valeur</th>
              </tr>
            </thead>
            <tbody>
              {rows().map((r) => (
                <tr key={r.id} className="border-b border-gray-100">
                  <td className="py-2 pr-3">{new Date(r.date).toLocaleString("fr-FR")}</td>
                  <td className="py-2 pr-3">{r.warehouseName}</td>
                  <td className="py-2 pr-3">{r.lignes}</td>
                  <td className="py-2">{formatNumber(Math.round(r.value))} FCFA</td>
                </tr>
              ))}
              {rows().length === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-gray-500">
                    Aucune production trouvée pour ces filtres.
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
