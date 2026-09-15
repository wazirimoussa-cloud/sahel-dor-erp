import { Link } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";
import { usePurchases } from "@/features/purchases/usePurchases";
import { NewPurchaseForm } from "@/features/purchases/NewPurchaseForm";
import { Card } from "@/components/ui/Card";
import { Pagination } from "@/components/ui/Pagination";
import { usePagination } from "@/lib/usePagination";
import { formatNumber } from "@/lib/format";
import { PURCHASE_STATUS_LABELS, PURCHASE_STATUS_CLASSES } from "@/lib/purchaseDisplay";
import { computeVatBreakdown } from "@/lib/vat";

export function PurchasesPage() {
  const { hasAttribution } = useAuth();
  const isReceptionsView = hasAttribution("achats.receptionner");
  const { page, pageSize, goToPrevious, goToNext } = usePagination();
  const { data, isLoading, error } = usePurchases(page, pageSize, isReceptionsView);
  const purchases = data?.rows;
  const canCreate = hasAttribution("achats.creer");

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-bold text-forest-900">
        {isReceptionsView ? "Réceptions" : "Bons d'achat"}
      </h1>

      {canCreate && (
        <Card>
          <NewPurchaseForm />
        </Card>
      )}

      <Card>
        {isLoading && <p className="text-sm text-gray-500">Chargement…</p>}
        {error && <p className="text-sm text-red-600">Impossible de charger les bons d'achat.</p>}
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500">
              <th scope="col" className="py-2">Date</th>
              <th scope="col" className="py-2">Fournisseur</th>
              <th scope="col" className="py-2">Magasin</th>
              <th scope="col" className="py-2">Lignes</th>
              <th scope="col" className="py-2">Total TTC</th>
              <th scope="col" className="py-2">Statut</th>
              <th scope="col" className="py-2" />
            </tr>
          </thead>
          <tbody>
            {purchases?.map((purchase) => {
              const items = purchase.purchase_items as {
                quantity: number;
                unit_cost: number;
                products:
                  | { vat_exempt: boolean; vat_reduced: boolean }
                  | { vat_exempt: boolean; vat_reduced: boolean }[]
                  | null;
              }[];
              const companyRelation = purchase.companies as
                | { vat_rate: number; vat_reduced_rate: number }
                | { vat_rate: number; vat_reduced_rate: number }[]
                | null;
              const company = Array.isArray(companyRelation) ? companyRelation[0] : companyRelation;
              const { totalTTC } = computeVatBreakdown(
                items.map((item) => {
                  const p = item.products;
                  const productInfo = Array.isArray(p) ? p[0] : p;
                  return {
                    quantity: item.quantity,
                    unitPrice: item.unit_cost,
                    vatExempt: productInfo?.vat_exempt ?? false,
                    vatReduced: productInfo?.vat_reduced ?? false,
                  };
                }),
                company?.vat_rate ?? 0,
                company?.vat_reduced_rate ?? 0,
              );
              const supplierRelation = purchase.suppliers as
                { name: string } | { name: string }[] | null;
              const supplierName = Array.isArray(supplierRelation)
                ? supplierRelation[0]?.name
                : supplierRelation?.name;
              const warehouseRelation = purchase.warehouses as
                { name: string } | { name: string }[] | null;
              const warehouseName = Array.isArray(warehouseRelation)
                ? warehouseRelation[0]?.name
                : warehouseRelation?.name;
              return (
                <tr key={purchase.id} className="border-b border-gray-100">
                  <td className="py-2">{new Date(purchase.created_at).toLocaleString("fr-FR")}</td>
                  <td className="py-2">{supplierName ?? "—"}</td>
                  <td className="py-2">{warehouseName ?? "—"}</td>
                  <td className="py-2">{items.length}</td>
                  <td className="py-2">{formatNumber(totalTTC)} FCFA</td>
                  <td className="py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${PURCHASE_STATUS_CLASSES[purchase.status] ?? ""}`}
                    >
                      {PURCHASE_STATUS_LABELS[purchase.status] ?? purchase.status}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    <Link
                      to={`/purchases/${purchase.id}`}
                      className="text-brand-600 hover:underline"
                    >
                      Voir le détail
                    </Link>
                  </td>
                </tr>
              );
            })}
            {purchases?.length === 0 && (
              <tr>
                <td colSpan={7} className="py-4 text-center text-gray-500">
                  Aucun bon d'achat pour le moment.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {purchases && (
          <Pagination
            page={page}
            hasNextPage={data?.hasNextPage ?? false}
            onPrevious={goToPrevious}
            onNext={goToNext}
          />
        )}
      </Card>
    </div>
  );
}
