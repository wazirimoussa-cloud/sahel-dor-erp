import { useState } from "react";
import { Link } from "react-router-dom";
import {
  useAllPurchaseLosses,
  useAllPurchaseLossRecoveredTotals,
  useAllPurchaseLossWrittenOffTotals,
} from "@/features/purchases/usePurchases";
import { useAllTransporters } from "@/features/transporters/useTransporters";
import { useAllProducts } from "@/features/products/useProducts";
import { Card } from "@/components/ui/Card";
import { ReportDateRangeFilter } from "@/components/reports/ReportDateRangeFilter";
import { ReportExportButton } from "@/components/reports/ReportExportButton";
import { formatNumber } from "@/lib/format";
import { exportRowsToExcel } from "@/lib/xlsx";

type RecoveryStatus = "en_attente" | "partiel" | "recouvre" | "passe_en_perte";

const STATUS_LABELS: Record<RecoveryStatus, string> = {
  en_attente: "En attente",
  partiel: "Partiel",
  recouvre: "Recouvré",
  passe_en_perte: "Passé en perte",
};

const STATUS_CLASSES: Record<RecoveryStatus, string> = {
  en_attente: "bg-amber-100 text-amber-700",
  partiel: "bg-blue-100 text-blue-700",
  recouvre: "bg-green-100 text-green-700",
  passe_en_perte: "bg-gray-200 text-gray-600",
};

// Les trois hooks réutilisés ici ramènent déjà l'intégralité des pertes transport (même
// source que PurchaseLossesPage.tsx et le point 110) -- pas de nouveau hook, filtrage
// entièrement côté client.
export function PurchaseLossesReport() {
  const { data: losses } = useAllPurchaseLosses();
  const { data: recoveredTotals } = useAllPurchaseLossRecoveredTotals();
  const { data: writtenOffTotals } = useAllPurchaseLossWrittenOffTotals();
  const { data: transporters } = useAllTransporters();
  const { data: products } = useAllProducts();

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [transporterId, setTransporterId] = useState("");
  const [productId, setProductId] = useState("");
  const [status, setStatus] = useState<"" | RecoveryStatus>("");

  function rows() {
    return (losses ?? [])
      .map((loss) => {
        const productRelation = loss.products as { name: string; unit: string } | { name: string; unit: string }[] | null;
        const product = Array.isArray(productRelation) ? productRelation[0] : productRelation;
        const transporterRelation = loss.transporters as { id: string; name: string } | { id: string; name: string }[] | null;
        const transporter = Array.isArray(transporterRelation) ? transporterRelation[0] : transporterRelation;
        const totalValue = loss.quantity_lost * loss.unit_cost;
        const recoveredAmount = recoveredTotals?.get(loss.id) ?? 0;
        const writtenOffAmount = writtenOffTotals?.get(loss.id) ?? 0;
        const remaining = totalValue - recoveredAmount - writtenOffAmount;
        const lossStatus: RecoveryStatus =
          recoveredAmount <= 0 && writtenOffAmount <= 0
            ? "en_attente"
            : remaining > 0
              ? "partiel"
              : recoveredAmount >= totalValue
                ? "recouvre"
                : "passe_en_perte";
        return {
          id: loss.id,
          purchaseId: loss.purchase_id,
          date: loss.created_at,
          productId: loss.product_id,
          productName: product?.name ?? "—",
          unit: product?.unit ?? "",
          transporterId: transporter?.id,
          transporterName: transporter?.name ?? "—",
          quantity: loss.quantity_lost,
          totalValue,
          recoveredAmount,
          writtenOffAmount,
          remaining,
          status: lossStatus,
        };
      })
      .filter((r) => {
        if (dateFrom && r.date < `${dateFrom}T00:00:00.000`) return false;
        if (dateTo && r.date > `${dateTo}T23:59:59.999`) return false;
        if (transporterId && r.transporterId !== transporterId) return false;
        if (productId && r.productId !== productId) return false;
        if (status && r.status !== status) return false;
        return true;
      });
  }

  async function handleExportExcel() {
    await exportRowsToExcel(
      `etat-pertes-transport-${new Date().toISOString().slice(0, 10)}.xlsx`,
      [
        { header: "Date", key: "date" },
        { header: "Transporteur", key: "transporteur" },
        { header: "Produit", key: "produit" },
        { header: "Quantité perdue", key: "quantite" },
        { header: "Valeur (FCFA)", key: "valeur" },
        { header: "Recouvré (FCFA)", key: "recouvre" },
        { header: "Passé en perte (FCFA)", key: "passeEnPerte" },
        { header: "Reste (FCFA)", key: "reste" },
        { header: "Statut", key: "statut" },
      ],
      rows().map((r) => ({
        date: new Date(r.date).toLocaleString("fr-FR"),
        transporteur: r.transporterName,
        produit: r.productName,
        quantite: `${r.quantity} ${r.unit}`.trim(),
        valeur: Math.round(r.totalValue),
        recouvre: Math.round(r.recoveredAmount),
        passeEnPerte: Math.round(r.writtenOffAmount),
        reste: Math.round(r.remaining),
        statut: STATUS_LABELS[r.status],
      })),
    );
  }

  const filteredRows = rows();

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-800">Pertes transport</h2>
        <ReportExportButton onExport={handleExportExcel} disabled={filteredRows.length === 0} />
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <ReportDateRangeFilter
          idPrefix="purchase-losses-report"
          startDate={dateFrom}
          endDate={dateTo}
          onStartDateChange={setDateFrom}
          onEndDateChange={setDateTo}
        />
        <div>
          <label htmlFor="purchase-losses-report-transporterId" className="mb-1 block text-xs font-medium text-gray-600">
            Transporteur
          </label>
          <select
            id="purchase-losses-report-transporterId"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            value={transporterId}
            onChange={(e) => setTransporterId(e.target.value)}
          >
            <option value="">Tous les transporteurs</option>
            {transporters?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="purchase-losses-report-productId" className="mb-1 block text-xs font-medium text-gray-600">
            Produit
          </label>
          <select
            id="purchase-losses-report-productId"
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
          <label htmlFor="purchase-losses-report-status" className="mb-1 block text-xs font-medium text-gray-600">
            Statut
          </label>
          <select
            id="purchase-losses-report-status"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            value={status}
            onChange={(e) => setStatus(e.target.value as "" | RecoveryStatus)}
          >
            <option value="">Tous</option>
            <option value="en_attente">En attente</option>
            <option value="partiel">Partiel</option>
            <option value="recouvre">Recouvré</option>
            <option value="passe_en_perte">Passé en perte</option>
          </select>
        </div>
      </div>

      {!losses && <p className="text-sm text-gray-500">Chargement…</p>}
      {losses && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th scope="col" className="py-2 pr-3">Date</th>
                <th scope="col" className="py-2 pr-3">Transporteur</th>
                <th scope="col" className="py-2 pr-3">Produit</th>
                <th scope="col" className="py-2 pr-3">Quantité</th>
                <th scope="col" className="py-2 pr-3">Valeur</th>
                <th scope="col" className="py-2 pr-3">Statut</th>
                <th scope="col" className="py-2">Bon d'achat</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr key={r.id} className="border-b border-gray-100">
                  <td className="py-2 pr-3">{new Date(r.date).toLocaleString("fr-FR")}</td>
                  <td className="py-2 pr-3">{r.transporterName}</td>
                  <td className="py-2 pr-3">{r.productName}</td>
                  <td className="py-2 pr-3">
                    {r.quantity} {r.unit}
                  </td>
                  <td className="py-2 pr-3">{formatNumber(Math.round(r.totalValue))} FCFA</td>
                  <td className="py-2 pr-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[r.status]}`}>
                      {STATUS_LABELS[r.status]}
                    </span>
                  </td>
                  <td className="py-2">
                    <Link to={`/purchases/${r.purchaseId}`} className="text-brand-600 hover:underline">
                      Voir
                    </Link>
                  </td>
                </tr>
              ))}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-4 text-center text-gray-500">
                    Aucune perte transport trouvée pour ces filtres.
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
