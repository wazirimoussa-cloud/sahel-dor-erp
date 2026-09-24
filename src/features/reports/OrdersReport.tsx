import { useState } from "react";
import { useOrders } from "@/features/orders/useOrders";
import { useActiveClients } from "@/features/clients/useClients";
import { Card } from "@/components/ui/Card";
import { ReportDateRangeFilter } from "@/components/reports/ReportDateRangeFilter";
import { ReportExportButton } from "@/components/reports/ReportExportButton";
import { ORDER_STATUS_LABELS, ORDER_STATUS_CLASSES } from "@/lib/orderDisplay";
import { computeVatBreakdown } from "@/lib/vat";
import { formatNumber } from "@/lib/format";
import { exportRowsToExcel } from "@/lib/xlsx";

const PAYMENT_LABELS: Record<string, string> = {
  unpaid: "Impayé",
  partial: "Partiel",
  paid: "Payé",
};

const PAYMENT_CLASSES: Record<string, string> = {
  unpaid: "bg-red-100 text-red-700",
  partial: "bg-amber-100 text-amber-700",
  paid: "bg-green-100 text-green-700",
};

// useOrders() ramène déjà l'intégralité des commandes (pas de pagination sur cette page
// aujourd'hui) -- pas de nouveau hook nécessaire, filtrage entièrement côté client.
export function OrdersReport() {
  const { data: orders, isLoading, error } = useOrders();
  const { data: clients } = useActiveClients();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [clientId, setClientId] = useState("");
  const [status, setStatus] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");

  function rows() {
    return (orders ?? [])
      .filter((order) => {
        if (dateFrom && order.created_at < `${dateFrom}T00:00:00.000`) return false;
        if (dateTo && order.created_at > `${dateTo}T23:59:59.999`) return false;
        const clientRelation = order.clients as { id?: string; name: string } | { id?: string; name: string }[] | null;
        const client = Array.isArray(clientRelation) ? clientRelation[0] : clientRelation;
        if (clientId && (client as { id?: string } | undefined)?.id !== clientId) return false;
        if (status && order.status !== status) return false;
        if (paymentStatus && order.payment_status !== paymentStatus) return false;
        return true;
      })
      .map((order) => {
        const items = order.order_items as {
          quantity: number;
          unit_price: number;
          products: { vat_exempt: boolean; vat_reduced: boolean } | { vat_exempt: boolean; vat_reduced: boolean }[] | null;
        }[];
        const companyRelation = order.companies as
          | { vat_rate: number; vat_reduced_rate: number }
          | { vat_rate: number; vat_reduced_rate: number }[]
          | null;
        const company = Array.isArray(companyRelation) ? companyRelation[0] : companyRelation;
        const { totalTTC } = computeVatBreakdown(
          items.map((item) => {
            const productInfo = Array.isArray(item.products) ? item.products[0] : item.products;
            return {
              quantity: item.quantity,
              unitPrice: item.unit_price,
              vatExempt: productInfo?.vat_exempt ?? false,
              vatReduced: productInfo?.vat_reduced ?? false,
            };
          }),
          company?.vat_rate ?? 0,
          company?.vat_reduced_rate ?? 0,
        );
        const clientRelation = order.clients as { name: string } | { name: string }[] | null;
        const clientName = Array.isArray(clientRelation) ? clientRelation[0]?.name : clientRelation?.name;
        return {
          id: order.id,
          date: order.created_at,
          clientName: clientName ?? "—",
          status: order.status,
          paymentStatus: order.payment_status,
          lignes: items.length,
          totalTTC,
        };
      });
  }

  async function handleExportExcel() {
    await exportRowsToExcel(
      `etat-ventes-${new Date().toISOString().slice(0, 10)}.xlsx`,
      [
        { header: "Date", key: "date" },
        { header: "Client", key: "client" },
        { header: "Statut", key: "statut" },
        { header: "Paiement", key: "paiement" },
        { header: "Lignes", key: "lignes" },
        { header: "Total TTC (FCFA)", key: "totalTTC" },
      ],
      rows().map((r) => ({
        date: new Date(r.date).toLocaleString("fr-FR"),
        client: r.clientName,
        statut: ORDER_STATUS_LABELS[r.status] ?? r.status,
        paiement: PAYMENT_LABELS[r.paymentStatus] ?? r.paymentStatus,
        lignes: r.lignes,
        totalTTC: Math.round(r.totalTTC),
      })),
    );
  }

  const filteredRows = rows();

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-800">Ventes</h2>
        <ReportExportButton onExport={handleExportExcel} disabled={filteredRows.length === 0} />
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <ReportDateRangeFilter
          idPrefix="orders-report"
          startDate={dateFrom}
          endDate={dateTo}
          onStartDateChange={setDateFrom}
          onEndDateChange={setDateTo}
        />
        <div>
          <label htmlFor="orders-report-clientId" className="mb-1 block text-xs font-medium text-gray-600">
            Client
          </label>
          <select
            id="orders-report-clientId"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          >
            <option value="">Tous les clients</option>
            {clients?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="orders-report-status" className="mb-1 block text-xs font-medium text-gray-600">
            Statut
          </label>
          <select
            id="orders-report-status"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Tous</option>
            <option value="pending">En attente</option>
            <option value="validated">Validé</option>
            <option value="cancelled">Annulé</option>
          </select>
        </div>
        <div>
          <label htmlFor="orders-report-paymentStatus" className="mb-1 block text-xs font-medium text-gray-600">
            Paiement
          </label>
          <select
            id="orders-report-paymentStatus"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            value={paymentStatus}
            onChange={(e) => setPaymentStatus(e.target.value)}
          >
            <option value="">Tous</option>
            <option value="unpaid">Impayé</option>
            <option value="partial">Partiel</option>
            <option value="paid">Payé</option>
          </select>
        </div>
      </div>

      {isLoading && <p className="text-sm text-gray-500">Chargement…</p>}
      {error && <p className="text-sm text-red-600">Impossible de charger les bons de commande.</p>}
      {orders && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th scope="col" className="py-2 pr-3">Date</th>
                <th scope="col" className="py-2 pr-3">Client</th>
                <th scope="col" className="py-2 pr-3">Statut</th>
                <th scope="col" className="py-2 pr-3">Paiement</th>
                <th scope="col" className="py-2 pr-3">Lignes</th>
                <th scope="col" className="py-2">Total TTC</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr key={r.id} className="border-b border-gray-100">
                  <td className="py-2 pr-3">{new Date(r.date).toLocaleString("fr-FR")}</td>
                  <td className="py-2 pr-3">{r.clientName}</td>
                  <td className="py-2 pr-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ORDER_STATUS_CLASSES[r.status] ?? ""}`}>
                      {ORDER_STATUS_LABELS[r.status] ?? r.status}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PAYMENT_CLASSES[r.paymentStatus] ?? ""}`}>
                      {PAYMENT_LABELS[r.paymentStatus] ?? r.paymentStatus}
                    </span>
                  </td>
                  <td className="py-2 pr-3">{r.lignes}</td>
                  <td className="py-2">{formatNumber(Math.round(r.totalTTC))} FCFA</td>
                </tr>
              ))}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-gray-500">
                    Aucun bon de commande trouvé pour ces filtres.
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
