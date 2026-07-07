import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";
import { useOrder, useUpdateOrderStatus } from "@/features/orders/useOrders";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

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

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: order, isLoading, error } = useOrder(id);
  const updateStatus = useUpdateOrderStatus();
  const [actionError, setActionError] = useState<string | null>(null);

  const canValidate = profile?.role === "admin" || profile?.role === "manager";

  if (isLoading) return <p className="text-sm text-gray-500">Chargement…</p>;
  if (error || !order) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-red-600">Commande introuvable ou accès refusé.</p>
        <Link to="/orders" className="text-sm text-brand-600 hover:underline">
          ← Retour aux commandes
        </Link>
      </div>
    );
  }

  const items = order.order_items as {
    id: string;
    quantity: number;
    unit_price: number;
    products: { id: string; name: string } | { id: string; name: string }[] | null;
  }[];
  const total = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const creatorRelation = order.users as { email: string } | { email: string }[] | null;
  const creatorEmail = Array.isArray(creatorRelation) ? creatorRelation[0]?.email : creatorRelation?.email;
  const orderId = order.id;

  async function handleStatusChange(status: "validated" | "cancelled") {
    const confirmMessage =
      status === "cancelled"
        ? "Annuler cette commande ? Le stock déjà décrémenté n'est pas restauré automatiquement (voir README)."
        : "Valider cette commande ? Cette action ne pourra plus être modifiée ensuite.";
    if (!window.confirm(confirmMessage)) return;

    setActionError(null);
    try {
      await updateStatus.mutateAsync({ orderId, status });
    } catch {
      setActionError("Action refusée (droits insuffisants ou commande déjà traitée).");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/orders" className="text-sm text-brand-600 hover:underline">
          ← Retour aux commandes
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-800">
            Commande #{order.id.slice(0, 8)}
          </h1>
          <p className="text-sm text-gray-500">
            Créée le {new Date(order.created_at).toLocaleString("fr-FR")} par{" "}
            {creatorEmail ?? "utilisateur inconnu"}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_CLASSES[order.status] ?? ""}`}>
          {STATUS_LABELS[order.status] ?? order.status}
        </span>
      </div>

      <Card>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500">
              <th className="py-2">Produit</th>
              <th className="py-2">Quantité</th>
              <th className="py-2">Prix unitaire</th>
              <th className="py-2">Sous-total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const product = item.products;
              const productName = Array.isArray(product) ? product[0]?.name : product?.name;
              return (
                <tr key={item.id} className="border-b border-gray-100">
                  <td className="py-2">{productName ?? "Produit supprimé"}</td>
                  <td className="py-2">{item.quantity}</td>
                  <td className="py-2">{item.unit_price.toLocaleString("fr-FR")} FCFA</td>
                  <td className="py-2">
                    {(item.unit_price * item.quantity).toLocaleString("fr-FR")} FCFA
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="pt-3 text-right text-sm font-medium text-gray-700">
                Total
              </td>
              <td className="pt-3 text-sm font-semibold text-gray-900">
                {total.toLocaleString("fr-FR")} FCFA
              </td>
            </tr>
          </tfoot>
        </table>
      </Card>

      {actionError && <p className="text-sm text-red-600">{actionError}</p>}

      {canValidate && order.status === "pending" && (
        <div className="flex gap-3">
          <Button disabled={updateStatus.isPending} onClick={() => void handleStatusChange("validated")}>
            Valider la commande
          </Button>
          <Button
            variant="danger"
            disabled={updateStatus.isPending}
            onClick={() => void handleStatusChange("cancelled")}
          >
            Annuler la commande
          </Button>
          <Button variant="secondary" onClick={() => navigate("/orders")}>
            Retour
          </Button>
        </div>
      )}
    </div>
  );
}
