import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/auth/useAuth";
import {
  useOrder,
  useValidateOrder,
  useCancelOrder,
  useRecordPayment,
  useOrderPayments,
} from "@/features/orders/useOrders";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AmountInput } from "@/components/ui/AmountInput";
import { generateOrderPdf } from "@/lib/pdf";
import { canSharePdf, shareOrDownloadPdf } from "@/lib/share";
import { formatNumber } from "@/lib/format";
import { ORDER_STATUS_LABELS, ORDER_STATUS_CLASSES } from "@/lib/orderDisplay";
import { computeVatBreakdown } from "@/lib/vat";

// Distingue les causes d'échec de validate_order()/cancel_order() plutôt que le message
// générique unique d'avant -- trouvé en vérification live (superviseur.formation, droits
// corrects, refus dû en réalité à un stock insuffisant dans le magasin de la commande, pas
// aux droits). Code Postgres 23514 = violation de contrainte CHECK ; product_stocks_stock_check
// est la seule contrainte de ce type que ces deux RPC peuvent déclencher (stock qui
// passerait sous 0 dans le magasin concerné).
function describeOrderActionError(err: unknown): string {
  const code = (err as { code?: string } | null)?.code;
  const message = (err as { message?: string } | null)?.message ?? "";
  if (code === "23514" && message.includes("product_stocks_stock_check")) {
    return "Stock insuffisant dans le magasin de cette commande pour couvrir la quantité demandée.";
  }
  return "Action refusée (droits insuffisants ou bon de commande déjà traité).";
}

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
  amount: z.coerce.number().positive("Montant invalide"),
});

type PaymentFormValues = z.infer<typeof paymentSchema>;

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasAttribution } = useAuth();
  const { data: order, isLoading, error } = useOrder(id);
  const { data: payments } = useOrderPayments(id);
  const validateOrder = useValidateOrder();
  const cancelOrder = useCancelOrder();
  const recordPayment = useRecordPayment();
  const [actionError, setActionError] = useState<string | null>(null);

  const canValidate = hasAttribution("ventes.valider_commande");
  const canCancel = hasAttribution("ventes.annuler_commande");
  const canRecordPayment = hasAttribution("ventes.encaisser_paiement");

  const {
    control: controlPayment,
    handleSubmit: handlePaymentSubmit,
    reset: resetPayment,
    formState: { isSubmitting: isSubmittingPayment, errors: paymentErrors },
  } = useForm<PaymentFormValues>({ resolver: zodResolver(paymentSchema) });

  if (isLoading) return <p className="text-sm text-gray-500">Chargement…</p>;
  if (error || !order) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-red-600">Bon de commande introuvable ou accès refusé.</p>
        <Link to="/orders" className="text-sm text-brand-600 hover:underline">
          ← Retour aux bons de commande
        </Link>
      </div>
    );
  }

  const items = order.order_items as {
    id: string;
    quantity: number;
    unit_price: number;
    products:
      | { id: string; name: string; unit: string; vat_exempt: boolean; vat_reduced: boolean }
      | { id: string; name: string; unit: string; vat_exempt: boolean; vat_reduced: boolean }[]
      | null;
  }[];
  function productInfoOf(item: (typeof items)[number]) {
    return Array.isArray(item.products) ? item.products[0] : item.products;
  }
  const companyRelation = order.companies as
    | { vat_rate: number; vat_reduced_rate: number }
    | { vat_rate: number; vat_reduced_rate: number }[]
    | null;
  const company = Array.isArray(companyRelation) ? companyRelation[0] : companyRelation;
  const vatRate = company?.vat_rate;
  const { totalHT, vatAmount, totalTTC } = computeVatBreakdown(
    items.map((item) => ({
      quantity: item.quantity,
      unitPrice: item.unit_price,
      vatExempt: productInfoOf(item)?.vat_exempt ?? false,
      vatReduced: productInfoOf(item)?.vat_reduced ?? false,
    })),
    company?.vat_rate ?? 0,
    company?.vat_reduced_rate ?? 0,
  );
  const resteAPayer = Math.max(0, totalTTC - order.amount_paid);
  const creatorRelation = order.users as { email: string } | { email: string }[] | null;
  const creatorEmail = Array.isArray(creatorRelation)
    ? creatorRelation[0]?.email
    : creatorRelation?.email;
  const clientRelation = order.clients as { name: string } | { name: string }[] | null;
  const clientName = Array.isArray(clientRelation) ? clientRelation[0]?.name : clientRelation?.name;
  const orderId = order.id;
  const orderCreatedAt = order.created_at;
  const orderPaymentStatusLabel = PAYMENT_LABELS[order.payment_status] ?? order.payment_status;
  const orderStatusLabel = ORDER_STATUS_LABELS[order.status] ?? order.status;
  const isOrderCancelled = order.status === "cancelled";

  async function buildOrderPdf() {
    const products = items.map((item) => {
      const productInfo = productInfoOf(item);
      return {
        productName: productInfo?.name ?? "Produit supprimé",
        quantity: item.quantity,
        unitAmount: item.unit_price,
        unit: productInfo?.unit,
      };
    });
    return generateOrderPdf({
      id: orderId,
      createdAt: orderCreatedAt,
      clientName: clientName ?? "—",
      items: products,
      totals: { totalHT, vatRate: vatRate ?? 0, vatAmount, totalTTC },
      paymentStatusLabel: orderPaymentStatusLabel,
      statusLabel: orderStatusLabel,
      isCancelled: isOrderCancelled,
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
    if (
      !window.confirm(
        "Valider ce bon de commande ? Le stock sortira à ce moment et l'écriture comptable sera générée — action irréversible.",
      )
    )
      return;
    setActionError(null);
    try {
      await validateOrder.mutateAsync(orderId);
    } catch (err) {
      setActionError(describeOrderActionError(err));
    }
  }

  async function handleCancel() {
    if (!window.confirm("Annuler ce bon de commande ?")) return;
    setActionError(null);
    try {
      await cancelOrder.mutateAsync(orderId);
    } catch (err) {
      setActionError(describeOrderActionError(err));
    }
  }

  async function onPaymentSubmit(values: PaymentFormValues) {
    setActionError(null);
    try {
      await recordPayment.mutateAsync({ orderId, amount: values.amount });
      resetPayment();
    } catch {
      setActionError(
        "Enregistrement du paiement refusé (droits insuffisants, ou montant supérieur au reste à payer).",
      );
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/orders" className="text-sm text-brand-600 hover:underline">
          ← Retour aux bons de commande
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-forest-900">Bon de commande #{order.id.slice(0, 8)}</h1>
          <p className="text-sm text-gray-500">
            Créé le {new Date(order.created_at).toLocaleString("fr-FR")} par{" "}
            {creatorEmail ?? "utilisateur inconnu"} — Client : {clientName ?? "—"}
          </p>
        </div>
        <div className="flex gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${ORDER_STATUS_CLASSES[order.status] ?? ""}`}
          >
            {ORDER_STATUS_LABELS[order.status] ?? order.status}
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
              <th scope="col" className="py-2">Produit</th>
              <th scope="col" className="py-2">Quantité</th>
              <th scope="col" className="py-2">Prix unitaire</th>
              <th scope="col" className="py-2">Sous-total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const productInfo = productInfoOf(item);
              return (
                <tr key={item.id} className="border-b border-gray-100">
                  <td className="py-2">
                    {productInfo?.name ?? "Produit supprimé"}
                    {productInfo?.vat_exempt && (
                      <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                        Exonéré TVA
                      </span>
                    )}
                    {productInfo?.vat_reduced && (
                      <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                        TVA réduite {company?.vat_reduced_rate ?? 0}%
                      </span>
                    )}
                  </td>
                  <td className="py-2">
                    {item.quantity} {productInfo?.unit ?? ""}
                  </td>
                  <td className="py-2">{formatNumber(item.unit_price)} FCFA</td>
                  <td className="py-2">
                    {formatNumber((item.unit_price * item.quantity))} FCFA
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
              <td className="pt-3 text-sm text-gray-800">{formatNumber(totalHT)} FCFA</td>
            </tr>
            <tr>
              <td colSpan={3} className="text-right text-sm text-gray-600">
                TVA (normal {vatRate ?? 0}%, réduit {company?.vat_reduced_rate ?? 0}%)
              </td>
              <td className="text-sm text-gray-800">{formatNumber(vatAmount)} FCFA</td>
            </tr>
            <tr>
              <td colSpan={3} className="text-right text-sm font-medium text-gray-700">
                Total TTC
              </td>
              <td className="text-sm font-semibold text-gray-900">
                {formatNumber(totalTTC)} FCFA
              </td>
            </tr>
            <tr>
              <td colSpan={3} className="text-right text-sm text-gray-600">
                Reste à payer
              </td>
              <td className="text-sm text-gray-800">{formatNumber(resteAPayer)} FCFA</td>
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

      {actionError && (
        <p role="alert" className="text-sm text-red-600">
          {actionError}
        </p>
      )}

      {order.status === "pending" && (canValidate || canCancel) && (
        <div className="flex gap-3">
          {canValidate && (
            <Button disabled={validateOrder.isPending} onClick={() => void handleValidate()}>
              Valider le bon de commande
            </Button>
          )}
          {canCancel && (
            <Button
              variant="danger"
              disabled={cancelOrder.isPending}
              onClick={() => void handleCancel()}
            >
              Annuler le bon de commande
            </Button>
          )}
          <Button variant="secondary" onClick={() => navigate("/orders")}>
            Retour
          </Button>
        </div>
      )}

      {canRecordPayment && (
        <Card>
          <h2 className="mb-3 text-sm font-medium text-gray-700">Enregistrer un paiement</h2>
          <p className="mb-2 text-xs text-gray-500">
            Reste à payer : {formatNumber(resteAPayer)} FCFA
          </p>
          <form
            onSubmit={handlePaymentSubmit(onPaymentSubmit)}
            className="flex flex-wrap items-end gap-3"
            noValidate
          >
            <div>
              <label htmlFor="order-payment-amount" className="mb-1 block text-xs font-medium text-gray-600">
                Montant reçu (FCFA)
              </label>
              <Controller
                control={controlPayment}
                name="amount"
                render={({ field }) => (
                  <AmountInput id="order-payment-amount" value={field.value} onChange={field.onChange} onBlur={field.onBlur} />
                )}
              />
              {paymentErrors.amount && (
                <p className="mt-1 text-xs text-red-600">{paymentErrors.amount.message}</p>
              )}
            </div>
            <Button type="submit" disabled={isSubmittingPayment || resteAPayer <= 0}>
              Enregistrer le paiement
            </Button>
          </form>
        </Card>
      )}

      {(canRecordPayment || payments?.length) && (
        <Card>
          <h2 className="mb-3 text-sm font-medium text-gray-700">Historique des paiements</h2>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th scope="col" className="py-2">Date</th>
                <th scope="col" className="py-2">Montant</th>
                <th scope="col" className="py-2">Enregistré par</th>
              </tr>
            </thead>
            <tbody>
              {payments?.map((payment) => {
                const userRelation = payment.users as
                  { email: string } | { email: string }[] | null;
                const userEmail = Array.isArray(userRelation)
                  ? userRelation[0]?.email
                  : userRelation?.email;
                return (
                  <tr key={payment.id} className="border-b border-gray-100">
                    <td className="py-2">{new Date(payment.created_at).toLocaleString("fr-FR")}</td>
                    <td className="py-2">{formatNumber(payment.amount)} FCFA</td>
                    <td className="py-2">{userEmail ?? "—"}</td>
                  </tr>
                );
              })}
              {payments?.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-4 text-center text-gray-500">
                    Aucun paiement enregistré.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
