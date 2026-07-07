import { Link } from "react-router-dom";
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

export function OrdersPage() {
  const { data: orders, isLoading, error } = useOrders();

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-gray-800">Commandes</h1>

      <Card>
        <NewOrderForm />
      </Card>

      <Card>
        {isLoading && <p className="text-sm text-gray-500">Chargement…</p>}
        {error && <p className="text-sm text-red-600">Impossible de charger les commandes.</p>}
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500">
              <th className="py-2">Date</th>
              <th className="py-2">Lignes</th>
              <th className="py-2">Total</th>
              <th className="py-2">Statut</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {orders?.map((order) => {
              const items = order.order_items as { quantity: number; unit_price: number }[];
              const total = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
              return (
                <tr key={order.id} className="border-b border-gray-100">
                  <td className="py-2">{new Date(order.created_at).toLocaleString("fr-FR")}</td>
                  <td className="py-2">{items.length}</td>
                  <td className="py-2">{total.toLocaleString("fr-FR")} FCFA</td>
                  <td className="py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[order.status] ?? ""}`}
                    >
                      {STATUS_LABELS[order.status] ?? order.status}
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
                <td colSpan={5} className="py-4 text-center text-gray-400">
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
