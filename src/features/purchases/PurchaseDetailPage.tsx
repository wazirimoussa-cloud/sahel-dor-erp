import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";
import { usePurchase, useReceivePurchase, useCancelPurchase } from "@/features/purchases/usePurchases";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { generatePurchasePdf } from "@/lib/pdf";
import { canSharePdf, shareOrDownloadPdf } from "@/lib/share";

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
  const { profile } = useAuth();
  const { data: purchase, isLoading, error } = usePurchase(id);
  const receivePurchase = useReceivePurchase();
  const cancelPurchase = useCancelPurchase();
  const [actionError, setActionError] = useState<string | null>(null);

  const canManage = profile?.role === "admin" || profile?.role === "logistics";

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
    products: { id: string; name: string } | { id: string; name: string }[] | null;
  }[];
  const totalHT = items.reduce((sum, item) => sum + item.quantity * item.unit_cost, 0);
  const companyRelation = purchase.companies as { vat_rate: number } | { vat_rate: number }[] | null;
  const vatRate = Array.isArray(companyRelation) ? companyRelation[0]?.vat_rate : companyRelation?.vat_rate;
  const vatAmount = vatRate ? Math.round(totalHT * vatRate) / 100 : 0;
  const totalTTC = totalHT + vatAmount;
  const creatorRelation = purchase.users as { email: string } | { email: string }[] | null;
  const creatorEmail = Array.isArray(creatorRelation) ? creatorRelation[0]?.email : creatorRelation?.email;
  const supplierRelation = purchase.suppliers as { name: string } | { name: string }[] | null;
  const supplierName = Array.isArray(supplierRelation) ? supplierRelation[0]?.name : supplierRelation?.name;
  const warehouseRelation = purchase.warehouses as { name: string } | { name: string }[] | null;
  const warehouseName = Array.isArray(warehouseRelation)
    ? warehouseRelation[0]?.name
    : warehouseRelation?.name;
  const purchaseId = purchase.id;
  const purchaseCreatedAt = purchase.created_at;

  async function buildPurchasePdf() {
    const products = items.map((item) => {
      const product = item.products;
      const productName = Array.isArray(product) ? product[0]?.name : product?.name;
      return {
        productName: productName ?? "Produit supprimé",
        quantity: item.quantity,
        unitAmount: item.unit_cost,
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

  async function handleReceive() {
    setActionError(null);
    try {
      await receivePurchase.mutateAsync(purchaseId);
    } catch {
      setActionError("Action refusée (droits insuffisants ou achat déjà traité).");
    }
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
          <h1 className="text-lg font-semibold text-gray-800">Achat #{purchase.id.slice(0, 8)}</h1>
          <p className="text-sm text-gray-500">
            Créé le {new Date(purchase.created_at).toLocaleString("fr-FR")} par{" "}
            {creatorEmail ?? "utilisateur inconnu"} — Fournisseur : {supplierName ?? "—"} — Magasin :{" "}
            {warehouseName ?? "—"}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_CLASSES[purchase.status] ?? ""}`}>
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
              const product = item.products;
              const productName = Array.isArray(product) ? product[0]?.name : product?.name;
              return (
                <tr key={item.id} className="border-b border-gray-100">
                  <td className="py-2">{productName ?? "Produit supprimé"}</td>
                  <td className="py-2">{item.quantity}</td>
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
      </div>

      {actionError && <p className="text-sm text-red-600">{actionError}</p>}

      {canManage && purchase.status === "pending" && (
        <div className="flex gap-3">
          <Button disabled={receivePurchase.isPending} onClick={() => void handleReceive()}>
            Recevoir l'achat
          </Button>
          <Button
            variant="danger"
            disabled={cancelPurchase.isPending}
            onClick={() => void handleCancel()}
          >
            Annuler l'achat
          </Button>
          <Button variant="secondary" onClick={() => navigate("/purchases")}>
            Retour
          </Button>
        </div>
      )}
    </div>
  );
}
