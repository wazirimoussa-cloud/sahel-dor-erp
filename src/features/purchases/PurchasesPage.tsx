import { Link } from "react-router-dom";
import { usePurchases } from "@/features/purchases/usePurchases";
import { NewPurchaseForm } from "@/features/purchases/NewPurchaseForm";
import { Card } from "@/components/ui/Card";

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

export function PurchasesPage() {
  const { data: purchases, isLoading, error } = usePurchases();

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-gray-800">Achats</h1>

      <Card>
        <NewPurchaseForm />
      </Card>

      <Card>
        {isLoading && <p className="text-sm text-gray-500">Chargement…</p>}
        {error && <p className="text-sm text-red-600">Impossible de charger les achats.</p>}
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500">
              <th className="py-2">Date</th>
              <th className="py-2">Fournisseur</th>
              <th className="py-2">Magasin</th>
              <th className="py-2">Lignes</th>
              <th className="py-2">Total TTC</th>
              <th className="py-2">Statut</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {purchases?.map((purchase) => {
              const items = purchase.purchase_items as { quantity: number; unit_cost: number }[];
              const totalHT = items.reduce((sum, item) => sum + item.quantity * item.unit_cost, 0);
              const companyRelation = purchase.companies as
                | { vat_rate: number }
                | { vat_rate: number }[]
                | null;
              const vatRate = Array.isArray(companyRelation)
                ? companyRelation[0]?.vat_rate
                : companyRelation?.vat_rate;
              const totalTTC = totalHT + (vatRate ? Math.round(totalHT * vatRate) / 100 : 0);
              const supplierRelation = purchase.suppliers as
                | { name: string }
                | { name: string }[]
                | null;
              const supplierName = Array.isArray(supplierRelation)
                ? supplierRelation[0]?.name
                : supplierRelation?.name;
              const warehouseRelation = purchase.warehouses as
                | { name: string }
                | { name: string }[]
                | null;
              const warehouseName = Array.isArray(warehouseRelation)
                ? warehouseRelation[0]?.name
                : warehouseRelation?.name;
              return (
                <tr key={purchase.id} className="border-b border-gray-100">
                  <td className="py-2">{new Date(purchase.created_at).toLocaleString("fr-FR")}</td>
                  <td className="py-2">{supplierName ?? "—"}</td>
                  <td className="py-2">{warehouseName ?? "—"}</td>
                  <td className="py-2">{items.length}</td>
                  <td className="py-2">{totalTTC.toLocaleString("fr-FR")} FCFA</td>
                  <td className="py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[purchase.status] ?? ""}`}
                    >
                      {STATUS_LABELS[purchase.status] ?? purchase.status}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    <Link to={`/purchases/${purchase.id}`} className="text-brand-600 hover:underline">
                      Voir le détail
                    </Link>
                  </td>
                </tr>
              );
            })}
            {purchases?.length === 0 && (
              <tr>
                <td colSpan={7} className="py-4 text-center text-gray-400">
                  Aucun achat pour le moment.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
