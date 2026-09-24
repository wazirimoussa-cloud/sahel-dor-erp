import { useState } from "react";
import { useTransformationsReport } from "@/features/reports/useTransformationsReport";
import { useAllWarehouses } from "@/features/warehouses/useWarehouses";
import { Card } from "@/components/ui/Card";
import { ReportDateRangeFilter } from "@/components/reports/ReportDateRangeFilter";
import { ReportExportButton } from "@/components/reports/ReportExportButton";
import { exportRowsToExcel } from "@/lib/xlsx";

type ProductUnitRelation = { unit: string } | { unit: string }[] | null;
function unitOf(row: { products: ProductUnitRelation }) {
  const p = row.products;
  return (Array.isArray(p) ? p[0] : p)?.unit;
}

export function TransformationsReport() {
  const { data: warehouses } = useAllWarehouses();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [warehouseId, setWarehouseId] = useState("");

  const { data: transformations, isLoading, error } = useTransformationsReport({
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    warehouseId: warehouseId || undefined,
  });

  function rows() {
    return (transformations ?? []).map((t) => {
      const warehouseRelation = t.warehouses as { name: string } | { name: string }[] | null;
      const warehouseName = Array.isArray(warehouseRelation) ? warehouseRelation[0]?.name : warehouseRelation?.name;
      const inputs = t.transformation_inputs as { quantity: number; products: ProductUnitRelation }[];
      const outputs = t.transformation_outputs as { quantity: number; products: ProductUnitRelation }[];
      const totalInputQty = inputs.reduce((sum, item) => sum + item.quantity, 0);
      const totalOutputQty = outputs.reduce((sum, item) => sum + item.quantity, 0);
      const allUnits = new Set([...inputs.map(unitOf), ...outputs.map(unitOf)]);
      const sameUnit = allUnits.size === 1;
      const rendement = sameUnit && totalInputQty > 0 ? (totalOutputQty / totalInputQty) * 100 : null;
      const rendementLabel = !sameUnit
        ? "— (unités différentes)"
        : rendement === null
          ? "—"
          : `${rendement.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}%`;
      return {
        id: t.id,
        date: t.created_at,
        warehouseName: warehouseName ?? "—",
        intrants: inputs.length,
        extrants: outputs.length,
        rendementLabel,
      };
    });
  }

  async function handleExportExcel() {
    await exportRowsToExcel(
      `etat-transformation-${new Date().toISOString().slice(0, 10)}.xlsx`,
      [
        { header: "Date", key: "date" },
        { header: "Magasin", key: "magasin" },
        { header: "Intrants", key: "intrants" },
        { header: "Extrants", key: "extrants" },
        { header: "Rendement", key: "rendement" },
      ],
      rows().map((r) => ({
        date: new Date(r.date).toLocaleString("fr-FR"),
        magasin: r.warehouseName,
        intrants: r.intrants,
        extrants: r.extrants,
        rendement: r.rendementLabel,
      })),
    );
  }

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-800">Transformation</h2>
        <ReportExportButton onExport={handleExportExcel} disabled={!transformations || transformations.length === 0} />
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <ReportDateRangeFilter
          idPrefix="transformations-report"
          startDate={dateFrom}
          endDate={dateTo}
          onStartDateChange={setDateFrom}
          onEndDateChange={setDateTo}
        />
        <div>
          <label htmlFor="transformations-report-warehouseId" className="mb-1 block text-xs font-medium text-gray-600">
            Magasin
          </label>
          <select
            id="transformations-report-warehouseId"
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
      {error && <p className="text-sm text-red-600">Impossible de charger les transformations.</p>}
      {transformations && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th scope="col" className="py-2 pr-3">Date</th>
                <th scope="col" className="py-2 pr-3">Magasin</th>
                <th scope="col" className="py-2 pr-3">Intrants</th>
                <th scope="col" className="py-2 pr-3">Extrants</th>
                <th scope="col" className="py-2">Rendement</th>
              </tr>
            </thead>
            <tbody>
              {rows().map((r) => (
                <tr key={r.id} className="border-b border-gray-100">
                  <td className="py-2 pr-3">{new Date(r.date).toLocaleString("fr-FR")}</td>
                  <td className="py-2 pr-3">{r.warehouseName}</td>
                  <td className="py-2 pr-3">{r.intrants}</td>
                  <td className="py-2 pr-3">{r.extrants}</td>
                  <td className="py-2">{r.rendementLabel}</td>
                </tr>
              ))}
              {rows().length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-gray-500">
                    Aucune transformation trouvée pour ces filtres.
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
