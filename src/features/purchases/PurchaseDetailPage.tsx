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
import { useAllTransporters } from "@/features/transporters/useTransporters";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { generatePurchasePdf, generateCreditNotePdf, generateReceptionPdf } from "@/lib/pdf";
import { canSharePdf, shareOrDownloadPdf } from "@/lib/share";
import { formatNumber } from "@/lib/format";
import { computeVatBreakdown } from "@/lib/vat";

interface ReceptionLine {
  quantityReceived: number;
  // Saisie libre (pas une sélection dans la liste Transporteurs) : receive_purchase()
  // réutilise un transporteur existant si le nom correspond, sinon en crée un nouveau.
  transporterName: string;
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
  const { hasAttribution, profile } = useAuth();
  const { data: purchase, isLoading, error } = usePurchase(id);
  const { data: losses } = usePurchaseLosses(id);
  const { data: transporters } = useAllTransporters();
  const receivePurchase = useReceivePurchase();
  const cancelPurchase = useCancelPurchase();
  const [actionError, setActionError] = useState<string | null>(null);

  const canReceive = hasAttribution("achats.receptionner");
  const canCancel = hasAttribution("achats.annuler");
  const canViewLandedCost = hasAttribution("comptabilite.consulter_prix_revient", "consultative");

  const {
    register: registerReception,
    handleSubmit: handleReceptionSubmit,
    watch: watchReception,
    formState: { errors: receptionErrors },
  } = useForm<ReceptionFormValues>();

  if (isLoading) return <p className="text-sm text-gray-500">Chargement…</p>;
  if (error || !purchase) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-red-600">Bon d'achat introuvable ou accès refusé.</p>
        <Link to="/purchases" className="text-sm text-brand-600 hover:underline">
          ← Retour aux bons d'achat
        </Link>
      </div>
    );
  }

  const items = purchase.purchase_items as {
    id: string;
    quantity: number;
    unit_cost: number;
    products:
      | { id: string; name: string; unit: string; vat_exempt: boolean; vat_reduced: boolean; unit_cost: number }
      | { id: string; name: string; unit: string; vat_exempt: boolean; vat_reduced: boolean; unit_cost: number }[]
      | null;
  }[];
  function productInfoOf(item: (typeof items)[number]) {
    return Array.isArray(item.products) ? item.products[0] : item.products;
  }
  const companyRelation = purchase.companies as
    | { vat_rate: number; vat_reduced_rate: number }
    | { vat_rate: number; vat_reduced_rate: number }[]
    | null;
  const company = Array.isArray(companyRelation) ? companyRelation[0] : companyRelation;
  const vatRate = company?.vat_rate;
  const { totalHT, vatAmount, totalTTC } = computeVatBreakdown(
    items.map((item) => ({
      quantity: item.quantity,
      unitPrice: item.unit_cost,
      vatExempt: productInfoOf(item)?.vat_exempt ?? false,
      vatReduced: productInfoOf(item)?.vat_reduced ?? false,
    })),
    company?.vat_rate ?? 0,
    company?.vat_reduced_rate ?? 0,
  );
  const creatorRelation = purchase.users as { email: string } | { email: string }[] | null;
  const creatorEmail = Array.isArray(creatorRelation)
    ? creatorRelation[0]?.email
    : creatorRelation?.email;
  // Le créateur d'un bon d'achat ne peut pas annuler son propre bon d'achat (séparation des
  // tâches, même si achats.annuler est détenu) -- reflète le contrôle serveur de
  // cancel_purchase().
  const canCancelThisPurchase = canCancel && purchase.user_id !== profile?.id;
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
        const transporterName = line.transporterName?.trim();
        if (!transporterName) {
          setActionError(
            `Un transporteur est requis pour la perte constatée sur "${productInfo?.name ?? "un produit"}".`,
          );
          return;
        }
        losses.push({
          productId: productInfo?.id ?? item.id,
          transporterName,
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
      setActionError("Action refusée (droits insuffisants, bon d'achat déjà traité, ou perte invalide).");
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
    const confirmed = window.confirm("Annuler ce bon d'achat ?");
    if (!confirmed) return;
    setActionError(null);
    try {
      await cancelPurchase.mutateAsync(purchaseId);
    } catch {
      setActionError("Action refusée (droits insuffisants ou bon d'achat déjà traité).");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/purchases" className="text-sm text-brand-600 hover:underline">
          ← Retour aux bons d'achat
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-forest-900">Bon d'achat #{purchase.id.slice(0, 8)}</h1>
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
              <th scope="col" className="py-2">Produit</th>
              <th scope="col" className="py-2">Quantité</th>
              <th scope="col" className="py-2">Coût unitaire</th>
              <th scope="col" className="py-2">Sous-total</th>
              {purchase.status === "received" && canViewLandedCost && (
                <th scope="col" className="py-2">Prix de revient / unité</th>
              )}
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
                  <td className="py-2">{formatNumber(item.unit_cost)} FCFA</td>
                  <td className="py-2">
                    {formatNumber((item.unit_cost * item.quantity))} FCFA
                  </td>
                  {purchase.status === "received" && canViewLandedCost && (
                    <td className="py-2">{formatNumber(productInfo?.unit_cost ?? 0)} FCFA</td>
                  )}
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
              {purchase.status === "received" && canViewLandedCost && <td className="pt-3" />}
            </tr>
            <tr>
              <td colSpan={3} className="text-right text-sm text-gray-600">
                TVA (normal {vatRate ?? 0}%, réduit {company?.vat_reduced_rate ?? 0}%)
              </td>
              <td className="text-sm text-gray-800">{formatNumber(vatAmount)} FCFA</td>
              {purchase.status === "received" && canViewLandedCost && <td />}
            </tr>
            <tr>
              <td colSpan={3} className="text-right text-sm font-medium text-gray-700">
                Total TTC
              </td>
              <td className="text-sm font-semibold text-gray-900">
                {formatNumber(totalTTC)} FCFA
              </td>
              {purchase.status === "received" && canViewLandedCost && <td />}
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

      {actionError && (
        <p role="alert" className="text-sm text-red-600">
          {actionError}
        </p>
      )}

      {purchase.status === "pending" && canReceive && (
        <Card>
          <h2 className="mb-3 text-sm font-medium text-gray-700">Réceptionner le bon d'achat</h2>
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
                  <th scope="col" className="py-2">Produit</th>
                  <th scope="col" className="py-2">Commandé</th>
                  <th scope="col" className="py-2">Reçu</th>
                  <th scope="col" className="py-2">Péremption</th>
                  <th scope="col" className="py-2">Transporteur (si perte)</th>
                  <th scope="col" className="py-2">Motif</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => {
                  // Le champ Transporteur ne devient actif que si une perte est constatée sur
                  // cette ligne (quantité reçue ≠ quantité commandée) -- avant toute frappe,
                  // watch() renvoie undefined pour un champ non contrôlé (defaultValue) : on
                  // retombe alors sur la quantité commandée, donc "pas de perte" par défaut.
                  // Un champ vidé (Number("") === 0) est traité comme une perte totale, même
                  // convention que le calcul de quantityLost à la soumission (onReceptionSubmit).
                  const watchedReceived = watchReception(`lines.${index}.quantityReceived` as const);
                  const quantityReceived = watchedReceived === undefined ? item.quantity : Number(watchedReceived);
                  const hasLoss = quantityReceived !== item.quantity;

                  return (
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
                        aria-label={`Quantité reçue — ${productInfoOf(item)?.name ?? "produit"}`}
                        {...registerReception(`lines.${index}.quantityReceived` as const)}
                      />
                    </td>
                    <td className="py-2">
                      <Input
                        type="date"
                        className="w-36"
                        aria-label={`Date de péremption — ${productInfoOf(item)?.name ?? "produit"}`}
                        {...registerReception(`lines.${index}.expiryDate` as const)}
                      />
                    </td>
                    <td className="py-2">
                      <Input
                        type="text"
                        list="transporters-datalist"
                        placeholder={hasLoss ? "Nom du transporteur" : "Aucune perte constatée"}
                        disabled={!hasLoss}
                        className="w-40 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
                        aria-label={`Transporteur — ${productInfoOf(item)?.name ?? "produit"}`}
                        {...registerReception(`lines.${index}.transporterName` as const)}
                      />
                    </td>
                    <td className="py-2">
                      <Input
                        type="text"
                        placeholder="Optionnel"
                        aria-label={`Motif — ${productInfoOf(item)?.name ?? "produit"}`}
                        {...registerReception(`lines.${index}.reason` as const)}
                      />
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Suggestions autocomplete partagées par les champs "Transporteur" de chaque
                ligne -- saisie libre, la liste existante n'est qu'une aide, jamais imposée. */}
            <datalist id="transporters-datalist">
              {transporters?.map((transporter) => <option key={transporter.id} value={transporter.name} />)}
            </datalist>

            <div className="grid grid-cols-2 gap-3 border-t border-gray-100 pt-3 sm:grid-cols-4">
              <div>
                <label htmlFor="driverName" className="mb-1 block text-xs font-medium text-gray-600">
                  Nom et prénom du chauffeur
                </label>
                <Input
                  id="driverName"
                  type="text"
                  {...registerReception("driverName", { required: true })}
                />
                {receptionErrors.driverName && (
                  <p className="mt-1 text-xs text-red-600">Requis</p>
                )}
              </div>
              <div>
                <label htmlFor="truckPlate" className="mb-1 block text-xs font-medium text-gray-600">
                  Immatriculation du camion
                </label>
                <Input
                  id="truckPlate"
                  type="text"
                  {...registerReception("truckPlate", { required: true })}
                />
                {receptionErrors.truckPlate && (
                  <p className="mt-1 text-xs text-red-600">Requis</p>
                )}
              </div>
              <div>
                <label htmlFor="driverPhone" className="mb-1 block text-xs font-medium text-gray-600">
                  Numéro de téléphone
                </label>
                <Input
                  id="driverPhone"
                  type="text"
                  {...registerReception("driverPhone", { required: true })}
                />
                {receptionErrors.driverPhone && (
                  <p className="mt-1 text-xs text-red-600">Requis</p>
                )}
              </div>
              <div>
                <label htmlFor="repackageCount" className="mb-1 block text-xs font-medium text-gray-600">
                  A reconditionner
                </label>
                <Input
                  id="repackageCount"
                  type="number"
                  min={0}
                  step="1"
                  placeholder="0"
                  {...registerReception("repackageCount")}
                />
              </div>
            </div>

            <div>
              <label htmlFor="observation" className="mb-1 block text-xs font-medium text-gray-600">
                Point d'observation
              </label>
              <textarea
                id="observation"
                rows={2}
                placeholder="Remarques générales sur la livraison (optionnel)"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                {...registerReception("observation")}
              />
            </div>

            <Button type="submit" disabled={receivePurchase.isPending}>
              Recevoir le bon d'achat
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
                <th scope="col" className="py-2">Produit</th>
                <th scope="col" className="py-2">Quantité perdue</th>
                <th scope="col" className="py-2">Valeur</th>
                <th scope="col" className="py-2">Transporteur</th>
                <th scope="col" className="py-2" />
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
                      {formatNumber((loss.quantity_lost * loss.unit_cost))} FCFA
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
        <div className="flex flex-col gap-2">
          <div className="flex gap-3">
            {canCancelThisPurchase && (
              <Button
                variant="danger"
                disabled={cancelPurchase.isPending}
                onClick={() => void handleCancel()}
              >
                Annuler le bon d'achat
              </Button>
            )}
            <Button variant="secondary" onClick={() => navigate("/purchases")}>
              Retour
            </Button>
          </div>
          {!canCancelThisPurchase && (
            <p className="text-xs text-gray-500">
              Le créateur d'un bon d'achat ne peut pas annuler son propre bon d'achat.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
