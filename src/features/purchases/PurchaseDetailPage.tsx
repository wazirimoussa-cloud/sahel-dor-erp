import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { useAuth } from "@/auth/useAuth";
import {
  usePurchase,
  useReceivePurchase,
  useCancelPurchase,
  usePurchaseLosses,
} from "@/features/purchases/usePurchases";
import { useTransporters } from "@/features/transporters/useTransporters";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { generatePurchasePdf, generateCreditNotePdf, generateReceptionPdf } from "@/lib/pdf";
import { canSharePdf, shareOrDownloadPdf } from "@/lib/share";

interface ReceptionLine {
  quantityReceived: number;
  transporterId: string;
  reason: string;
  expiryDate: string;
}
interface ReceptionFormValues {
  lines: ReceptionLine[];
  driverName: string;
  truckPlate: string;
  driverPhone: string;
  repackageCount: number;
  observation: string;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  received: "Reçu",
  cancelled: "Annulé",
};

const STATUS_CLASSES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  received: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

export function PurchaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasAttribution } = useAuth();
  const { data: purchase, isLoading, error } = usePurchase(id);
  const { data: losses } = usePurchaseLosses(id);
  const { data: transporters } = useTransporters();
  const receivePurchase = useReceivePurchase();
  const cancelPurchase = useCancelPurchase();
  const [actionError, setActionError] = useState<string | null>(null);

  const canReceive = hasAttribution("achats.receptionner");
  const canCancel = hasAttribution("achats.annuler");

  const {
    register: registerReception,
    handleSubmit: handleReceptionSubmit,
    formState: { errors: receptionErrors },
  } = useForm<ReceptionFormValues>();

  if (isLoading) return <p className="text-sm text-gray-500">Chargement…</p>;
  if (error || !purchase) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-red-600">Achat introuvable ou accès refusé.</p>
        <Link to="/purchases" className="text-sm text-brand-600 hover:underline">
          ← Retour aux achats
        </Link>
      </div>
    );
  }

  const items = purchase.purchase_items as {
    id: string;
    quantity: number;
    unit_cost: number;
    products:
      | { id: string; name: string; unit: string; vat_exempt: boolean }
      | { id: string; name: string; unit: string; vat_exempt: boolean }[]
      | null;
  }[];
  function productInfoOf(item: (typeof items)[number]) {
    return Array.isArray(item.products) ? item.products[0] : item.products;
  }
  const totalHT = items.reduce((sum, item) => sum + item.quantity * item.unit_cost, 0);
  const taxableHT = items.reduce((sum, item) => {
    if (productInfoOf(item)?.vat_exempt) return sum;
    return sum + item.quantity * item.unit_cost;
  }, 0);
  const companyRelation = purchase.companies as
    { vat_rate: number } | { vat_rate: number }[] | null;
  const vatRate = Array.isArray(companyRelation)
    ? companyRelation[0]?.vat_rate
    : companyRelation?.vat_rate;
  const vatAmount = vatRate ? Math.round(taxableHT * vatRate) / 100 : 0;
  const totalTTC = totalHT + vatAmount;
  const creatorRelation = purchase.users as { email: string } | { email: string }[] | null;
  const creatorEmail = Array.isArray(creatorRelation)
    ? creatorRelation[0]?.email
    : creatorRelation?.email;
  const supplierRelation = purchase.suppliers as
    | { name: string; address: string | null }
    | { name: string; address: string | null }[]
    | null;
  const supplierInfo = Array.isArray(supplierRelation) ? supplierRelation[0] : supplierRelation;
  const supplierName = supplierInfo?.name;
  const supplierAddress = supplierInfo?.address;
  const warehouseRelation = purchase.warehouses as { name: string } | { name: string }[] | null;
  const warehouseName = Array.isArray(warehouseRelation)
    ? warehouseRelation[0]?.name
    : warehouseRelation?.name;
  const purchaseId = purchase.id;
  const purchaseCreatedAt = purchase.created_at;
  const receiptNumber = purchase.receipt_number;
  const receivedAt = purchase.received_at;
  const driverName = purchase.driver_name;
  const truckPlate = purchase.truck_plate;
  const driverPhone = purchase.driver_phone;
  const repackageCount = purchase.repackage_count;
  const observation = purchase.observation;

  async function buildPurchasePdf() {
    const products = items.map((item) => {
      const productInfo = productInfoOf(item);
      return {
        productName: productInfo?.name ?? "Produit supprimé",
        quantity: item.quantity,
        unitAmount: item.unit_cost,
        unit: productInfo?.unit,
      };
    });
    return generatePurchasePdf({
      id: purchaseId,
      createdAt: purchaseCreatedAt,
      supplierName: supplierName ?? "—",
      warehouseName: warehouseName ?? "—",
      items: products,
      totals: { totalHT, vatRate: vatRate ?? 0, vatAmount, totalTTC },
    });
  }

  async function handleDownloadPdf() {
    const { doc, filename } = await buildPurchasePdf();
    doc.save(filename);
  }

  async function handleSharePdf() {
    const { doc, filename } = await buildPurchasePdf();
    await shareOrDownloadPdf(doc, filename, `Bon d'achat #${purchaseId.slice(0, 8)}`);
  }

  async function onReceptionSubmit(values: ReceptionFormValues) {
    setActionError(null);
    const losses = [];
    const lotExpiryDates = [];
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const line = values.lines[index];
      const productInfo = productInfoOf(item);
      const quantityLost = item.quantity - Number(line.quantityReceived);
      if (quantityLost > 0) {
        if (!line.transporterId) {
          setActionError(
            `Un transporteur est requis pour la perte constatée sur "${productInfo?.name ?? "un produit"}".`,
          );
          return;
        }
        losses.push({
          productId: productInfo?.id ?? item.id,
          transporterId: line.transporterId,
          quantityLost,
          reason: line.reason,
        });
      }
      if (line.expiryDate) {
        lotExpiryDates.push({ productId: productInfo?.id ?? item.id, expiryDate: line.expiryDate });
      }
    }
    try {
      await receivePurchase.mutateAsync({
        purchaseId,
        losses,
        lotExpiryDates,
        driverName: values.driverName,
        truckPlate: values.truckPlate,
        driverPhone: values.driverPhone,
        repackageCount: values.repackageCount ? Number(values.repackageCount) : undefined,
        observation: values.observation,
      });
    } catch {
      setActionError("Action refusée (droits insuffisants, achat déjà traité, ou perte invalide).");
    }
  }

  async function handleDownloadReceptionPdf() {
    const products = items.map((item, index) => {
      const productInfo = productInfoOf(item);
      const loss = losses?.find((l) => {
        const productRelation = l.products as { name: string } | { name: string }[] | null;
        const lossProductName = Array.isArray(productRelation)
          ? productRelation[0]?.name
          : productRelation?.name;
        return lossProductName === productInfo?.name;
      });
      const quantityLost = loss?.quantity_lost ?? 0;
      return {
        productName: productInfo?.name ?? `Produit ${index + 1}`,
        unit: productInfo?.unit,
        quantityLoaded: item.quantity,
        quantityUnloaded: item.quantity - quantityLost,
      };
    });
    const { doc, filename } = await generateReceptionPdf({
      purchaseId,
      receiptNumber: receiptNumber ?? 0,
      receivedAt: receivedAt ?? purchaseCreatedAt,
      warehouseName: warehouseName ?? "—",
      supplierName: supplierName ?? "—",
      supplierAddress: supplierAddress ?? undefined,
      driverName: driverName ?? "—",
      truckPlate: truckPlate ?? "—",
      driverPhone: driverPhone ?? "—",
      repackageCount: repackageCount ?? 0,
      observation: observation ?? undefined,
      items: products,
    });
    doc.save(filename);
  }

  async function handleCancel() {
    const confirmed = window.confirm("Annuler cet achat ?");
    if (!confirmed) return;
    setActionError(null);
    try {
      await cancelPurchase.mutateAsync(purchaseId);
    } catch {
      setActionError("Action refusée (droits insuffisants ou achat déjà traité).");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/purchases" className="text-sm text-brand-600 hover:underline">
          ← Retour aux achats
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-forest-900">Achat #{purchase.id.slice(0, 8)}</h1>
          <p className="text-sm text-gray-500">
            Créé le {new Date(purchase.created_at).toLocaleString("fr-FR")} par{" "}
            {creatorEmail ?? "utilisateur inconnu"} — Fournisseur : {supplierName ?? "—"} — Magasin
            : {warehouseName ?? "—"}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_CLASSES[purchase.status] ?? ""}`}
        >
          {STATUS_LABELS[purchase.status] ?? purchase.status}
        </span>
      </div>

      <Card>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500">
              <th className="py-2">Produit</th>
              <th className="py-2">Quantité</th>
              <th className="py-2">Coût unitaire</th>
              <th className="py-2">Sous-total</th>
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
                  </td>
                  <td className="py-2">
                    {item.quantity} {productInfo?.unit ?? ""}
                  </td>
                  <td className="py-2">{item.unit_cost.toLocaleString("fr-FR")} FCFA</td>
                  <td className="py-2">
                    {(item.unit_cost * item.quantity).toLocaleString("fr-FR")} FCFA
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
        {purchase.status === "received" && (
          <Button variant="secondary" onClick={() => void handleDownloadReceptionPdf()}>
            Bon de réception (PDF)
          </Button>
        )}
      </div>

      {actionError && <p className="text-sm text-red-600">{actionError}</p>}

      {purchase.status === "pending" && canReceive && (
        <Card>
          <h2 className="mb-3 text-sm font-medium text-gray-700">Réceptionner l'achat</h2>
          <p className="mb-3 text-xs text-gray-500">
            Par défaut, la quantité reçue est égale à la quantité commandée. Réduisez-la si une
            perte est constatée à la livraison — un transporteur devient alors requis pour cette
            ligne.
          </p>
          <form
            onSubmit={handleReceptionSubmit(onReceptionSubmit)}
            className="space-y-3"
            noValidate
          >
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  <th className="py-2">Produit</th>
                  <th className="py-2">Commandé</th>
                  <th className="py-2">Reçu</th>
                  <th className="py-2">Péremption</th>
                  <th className="py-2">Transporteur (si perte)</th>
                  <th className="py-2">Motif</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={item.id} className="border-b border-gray-100">
                    <td className="py-2">{productInfoOf(item)?.name ?? "Produit supprimé"}</td>
                    <td className="py-2">
                      {item.quantity} {productInfoOf(item)?.unit ?? ""}
                    </td>
                    <td className="py-2">
                      <Input
                        type="number"
                        step="0.001"
                        defaultValue={item.quantity}
                        min={0}
                        max={item.quantity}
                        className="w-20"
                        {...registerReception(`lines.${index}.quantityReceived` as const)}
                      />
                    </td>
                    <td className="py-2">
                      <Input
                        type="date"
                        className="w-36"
                        {...registerReception(`lines.${index}.expiryDate` as const)}
                      />
                    </td>
                    <td className="py-2">
                      <select
                        className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                        {...registerReception(`lines.${index}.transporterId` as const)}
                      >
                        <option value="">— Aucune —</option>
                        {transporters?.map((transporter) => (
                          <option key={transporter.id} value={transporter.id}>
                            {transporter.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2">
                      <Input
                        type="text"
                        placeholder="Optionnel"
                        {...registerReception(`lines.${index}.reason` as const)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="grid grid-cols-2 gap-3 border-t border-gray-100 pt-3 sm:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Nom et prénom du chauffeur
                </label>
                <Input
                  type="text"
                  {...registerReception("driverName", { required: true })}
                />
                {receptionErrors.driverName && (
                  <p className="mt-1 text-xs text-red-600">Requis</p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Immatriculation du camion
                </label>
                <Input
                  type="text"
                  {...registerReception("truckPlate", { required: true })}
                />
                {receptionErrors.truckPlate && (
                  <p className="mt-1 text-xs text-red-600">Requis</p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Numéro de téléphone
                </label>
                <Input
                  type="text"
                  {...registerReception("driverPhone", { required: true })}
                />
                {receptionErrors.driverPhone && (
                  <p className="mt-1 text-xs text-red-600">Requis</p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Sacs à reconditionner
                </label>
                <Input
                  type="number"
                  min={0}
                  step="1"
                  placeholder="0"
                  {...registerReception("repackageCount")}
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Point d'observation
              </label>
              <textarea
                rows={2}
                placeholder="Remarques générales sur la livraison (optionnel)"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                {...registerReception("observation")}
              />
            </div>

            <Button type="submit" disabled={receivePurchase.isPending}>
              Recevoir l'achat
            </Button>
          </form>
        </Card>
      )}

      {losses && losses.length > 0 && (
        <Card>
          <h2 className="mb-3 text-sm font-medium text-gray-700">Pertes constatées</h2>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="py-2">Produit</th>
                <th className="py-2">Quantité perdue</th>
                <th className="py-2">Valeur</th>
                <th className="py-2">Transporteur</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {losses.map((loss) => {
                const productRelation = loss.products as
                  { name: string; unit: string } | { name: string; unit: string }[] | null;
                const productInfo = Array.isArray(productRelation)
                  ? productRelation[0]
                  : productRelation;
                const transporterRelation = loss.transporters as
                  { id: string; name: string } | { id: string; name: string }[] | null;
                const transporter = Array.isArray(transporterRelation)
                  ? transporterRelation[0]
                  : transporterRelation;
                return (
                  <tr key={loss.id} className="border-b border-gray-100">
                    <td className="py-2">{productInfo?.name ?? "—"}</td>
                    <td className="py-2">
                      {loss.quantity_lost} {productInfo?.unit ?? ""}
                    </td>
                    <td className="py-2">
                      {(loss.quantity_lost * loss.unit_cost).toLocaleString("fr-FR")} FCFA
                    </td>
                    <td className="py-2">{transporter?.name ?? "—"}</td>
                    <td className="py-2 text-right">
                      <Button
                        variant="secondary"
                        onClick={() =>
                          void generateCreditNotePdf({
                            purchaseId,
                            transporterName: transporter?.name ?? "—",
                            createdAt: loss.created_at,
                            items: [
                              {
                                productName: productInfo?.name ?? "Produit supprimé",
                                quantityLost: loss.quantity_lost,
                                unitCost: loss.unit_cost,
                                unit: productInfo?.unit,
                              },
                            ],
                          }).then(({ doc, filename }) => doc.save(filename))
                        }
                      >
                        Facture d'avoir (PDF)
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {purchase.status === "pending" && canCancel && (
        <div className="flex gap-3">
          {canCancel && (
            <Button
              variant="danger"
              disabled={cancelPurchase.isPending}
              onClick={() => void handleCancel()}
            >
              Annuler l'achat
            </Button>
          )}
          <Button variant="secondary" onClick={() => navigate("/purchases")}>
            Retour
          </Button>
        </div>
      )}
    </div>
  );
}
