import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/auth/useAuth";
import {
  useOrder,
  useValidateOrder,
  useCancelOrder,
  useRecordPayment,
} from "@/features/orders/useOrders";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { PaymentStatus } from "@/lib/database.types";
import { generateOrderPdf } from "@/lib/pdf";
import { canSharePdf, shareOrDownloadPdf } from "@/lib/share";

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

const paymentSchema = z.object({
  paymentStatus: z.enum(["unpaid", "partial", "paid"]),
  amountPaid: z.coerce.number().min(0, "Montant invalide"),
});

type PaymentFormValues = z.infer<typeof paymentSchema>;

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: order, isLoading, error } = useOrder(id);
  const validateOrder = useValidateOrder();
  const cancelOrder = useCancelOrder();
  const recordPayment = useRecordPayment();
  const [actionError, setActionError] = useState<string | null>(null);

  const canManage = profile?.role === "admin" || profile?.role === "sales";

  const {
    register: registerPayment,
    handleSubmit: handlePaymentSubmit,
    reset: resetPayment,
    formState: { isSubmitting: isSubmittingPayment },
  } = useForm<PaymentFormValues>({ resolver: zodResolver(paymentSchema) });

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
  const totalHT = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const companyRelation = order.companies as { vat_rate: number } | { vat_rate: number }[] | null;
  const vatRate = Array.isArray(companyRelation) ? companyRelation[0]?.vat_rate : companyRelation?.vat_rate;
  const vatAmount = vatRate ? Math.round(totalHT * vatRate) / 100 : 0;
  const totalTTC = totalHT + vatAmount;
  const creatorRelation = order.users as { email: string } | { email: string }[] | null;
  const creatorEmail = Array.isArray(creatorRelation) ? creatorRelation[0]?.email : creatorRelation?.email;
  const clientRelation = order.clients as { name: string } | { name: string }[] | null;
  const clientName = Array.isArray(clientRelation) ? clientRelation[0]?.name : clientRelation?.name;
  const orderId = order.id;
  const orderCreatedAt = order.created_at;
  const orderPaymentStatusLabel = PAYMENT_LABELS[order.payment_status] ?? order.payment_status;

  async function buildOrderPdf() {
    const products = items.map((item) => {
      const product = item.products;
      const productName = Array.isArray(product) ? product[0]?.name : product?.name;
      return {
        productName: productName ?? "Produit supprimé",
        quantity: item.quantity,
        unitAmount: item.unit_price,
      };
    });
    return generateOrderPdf({
      id: orderId,
      createdAt: orderCreatedAt,
      clientName: clientName ?? "—",
      items: products,
      totals: { totalHT, vatRate: vatRate ?? 0, vatAmount, totalTTC },
      paymentStatusLabel: orderPaymentStatusLabel,
    });
  }

  async function handleDownloadPdf() {
    const { doc, filename } = await buildOrderPdf();
    doc.save(filename);
  }

  async function handleSharePdf() {
    const { doc, filename } = await buildOrderPdf();
    await shareOrDownloadPdf(doc, filename, `Facture #${orderId.slice(0, 8)}`);
  }

  async function handleValidate() {
    if (!window.confirm("Valider cette commande ? Cette action ne pourra plus être modifiée ensuite.")) return;
    setActionError(null);
    try {
      await validateOrder.mutateAsync(orderId);
    } catch {
      setActionError("Action refusée (droits insuffisants ou commande déjà traitée).");
    }
  }

  async function handleCancel() {
    if (!window.confirm("Annuler cette commande ? Le stock sera restauré.")) return;
    setActionError(null);
    try {
      await cancelOrder.mutateAsync(orderId);
    } catch {
      setActionError("Action refusée (droits insuffisants ou commande déjà traitée).");
    }
  }

  async function onPaymentSubmit(values: PaymentFormValues) {
    setActionError(null);
    try {
      await recordPayment.mutateAsync({
        orderId,
        paymentStatus: values.paymentStatus as PaymentStatus,
        amountPaid: values.amountPaid,
      });
      resetPayment();
    } catch {
      setActionError("Enregistrement du paiement refusé (droits insuffisants).");
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
            {creatorEmail ?? "utilisateur inconnu"} — Client : {clientName ?? "—"}
          </p>
        </div>
        <div className="flex gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_CLASSES[order.status] ?? ""}`}>
            {STATUS_LABELS[order.status] ?? order.status}
          </span>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${PAYMENT_CLASSES[order.payment_status] ?? ""}`}
          >
            {PAYMENT_LABELS[order.payment_status] ?? order.payment_status}
          </span>
        </div>
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
              <td colSpan={3} className="pt-3 text-right text-sm text-gray-600">
                Sous-total HT
              </td>
              <td className="pt-3 text-sm text-gray-800">{totalHT.toLocaleString("fr-FR")} FCFA</td>
            </tr>
            <tr>
              <td colSpan={3} className="text-right text-sm text-gray-600">
                TVA ({vatRate ?? 0}%)
              </td>
              <td className="text-sm text-gray-800">{vatAmount.toLocaleString("fr-FR")} FCFA</td>
            </tr>
            <tr>
              <td colSpan={3} className="text-right text-sm font-medium text-gray-700">
                Total TTC
              </td>
              <td className="text-sm font-semibold text-gray-900">
                {totalTTC.toLocaleString("fr-FR")} FCFA
              </td>
            </tr>
          </tfoot>
        </table>
      </Card>

      <div className="flex gap-3">
        <Button variant="secondary" onClick={() => void handleDownloadPdf()}>
          Télécharger le PDF
        </Button>
        {canSharePdf() && (
          <Button variant="secondary" onClick={() => void handleSharePdf()}>
            Partager
          </Button>
        )}
      </div>

      {actionError && <p className="text-sm text-red-600">{actionError}</p>}

      {canManage && order.status === "pending" && (
        <div className="flex gap-3">
          <Button disabled={validateOrder.isPending} onClick={() => void handleValidate()}>
            Valider la commande
          </Button>
          <Button variant="danger" disabled={cancelOrder.isPending} onClick={() => void handleCancel()}>
            Annuler la commande
          </Button>
          <Button variant="secondary" onClick={() => navigate("/orders")}>
            Retour
          </Button>
        </div>
      )}

      {canManage && (
        <Card>
          <h2 className="mb-3 text-sm font-medium text-gray-700">Enregistrer un paiement</h2>
          <form
            onSubmit={handlePaymentSubmit(onPaymentSubmit)}
            className="flex flex-wrap items-end gap-3"
            noValidate
          >
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Statut</label>
              <select
                className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                defaultValue={order.payment_status}
                {...registerPayment("paymentStatus")}
              >
                <option value="unpaid">Impayé</option>
                <option value="partial">Partiel</option>
                <option value="paid">Payé</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Montant payé (FCFA)</label>
              <Input
                type="number"
                defaultValue={order.amount_paid}
                {...registerPayment("amountPaid")}
              />
            </div>
            <Button type="submit" disabled={isSubmittingPayment}>
              Enregistrer le paiement
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
