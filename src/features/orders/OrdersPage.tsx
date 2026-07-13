import { Link } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";
import { useOrders } from "@/features/orders/useOrders";
import { NewOrderForm } from "@/features/orders/NewOrderForm";
import { Card } from "@/components/ui/Card";

const STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  validated: "Validée",
  cancelled: "Annulée",
};

const STATUS_CLASSES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  validated: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

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

export function OrdersPage() {
  const { profile } = useAuth();
  const { data: orders, isLoading, error } = useOrders();
  const canCreate = profile?.role === "sales_operator";

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-gray-800">Commandes</h1>

      {canCreate && (
        <Card>
          <NewOrderForm />
        </Card>
      )}

      <Card>
        {isLoading && <p className="text-sm text-gray-500">Chargement…</p>}
        {error && <p className="text-sm text-red-600">Impossible de charger les commandes.</p>}
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500">
              <th className="py-2">Date</th>
              <th className="py-2">Client</th>
              <th className="py-2">Lignes</th>
              <th className="py-2">Total TTC</th>
              <th className="py-2">Statut</th>
              <th className="py-2">Paiement</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {orders?.map((order) => {
              const items = order.order_items as {
                quantity: number;
                unit_price: number;
                products: { vat_exempt: boolean } | { vat_exempt: boolean }[] | null;
              }[];
              const totalHT = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
              const taxableHT = items.reduce((sum, item) => {
                const p = item.products;
                const productInfo = Array.isArray(p) ? p[0] : p;
                if (productInfo?.vat_exempt) return sum;
                return sum + item.quantity * item.unit_price;
              }, 0);
              const companyRelation = order.companies as
                | { vat_rate: number }
                | { vat_rate: number }[]
                | null;
              const vatRate = Array.isArray(companyRelation)
                ? companyRelation[0]?.vat_rate
                : companyRelation?.vat_rate;
              const totalTTC = totalHT + (vatRate ? Math.round(taxableHT * vatRate) / 100 : 0);
              const clientRelation = order.clients as { name: string } | { name: string }[] | null;
              const clientName = Array.isArray(clientRelation) ? clientRelation[0]?.name : clientRelation?.name;
              return (
                <tr key={order.id} className="border-b border-gray-100">
                  <td className="py-2">{new Date(order.created_at).toLocaleString("fr-FR")}</td>
                  <td className="py-2">{clientName ?? "—"}</td>
                  <td className="py-2">{items.length}</td>
                  <td className="py-2">{totalTTC.toLocaleString("fr-FR")} FCFA</td>
                  <td className="py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[order.status] ?? ""}`}
                    >
                      {STATUS_LABELS[order.status] ?? order.status}
                    </span>
                  </td>
                  <td className="py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${PAYMENT_CLASSES[order.payment_status] ?? ""}`}
                    >
                      {PAYMENT_LABELS[order.payment_status] ?? order.payment_status}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    <Link to={`/orders/${order.id}`} className="text-brand-600 hover:underline">
                      Voir le détail
                    </Link>
                  </td>
                </tr>
              );
            })}
            {orders?.length === 0 && (
              <tr>
                <td colSpan={7} className="py-4 text-center text-gray-400">
                  Aucune commande pour le moment.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
