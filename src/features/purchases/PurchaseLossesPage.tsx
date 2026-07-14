import { Link } from "react-router-dom";
import { useAllPurchaseLosses } from "@/features/purchases/usePurchases";
import { generateCreditNotePdf } from "@/lib/pdf";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export function PurchaseLossesPage() {
  const { data: losses, isLoading, error } = useAllPurchaseLosses();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-forest-900">Pertes transport</h1>
        <p className="mt-1 text-sm text-gray-500">
          Pertes constatées à la réception des achats, avant l'entrée en stock — facturées en avoir
          au transporteur responsable. Enregistrées depuis la page de détail d'un achat, au moment
          de la réception.
        </p>
      </div>

      <Card>
        {isLoading && <p className="text-sm text-gray-500">Chargement…</p>}
        {error && <p className="text-sm text-red-600">Impossible de charger les pertes.</p>}
        {losses && (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="py-2">Date</th>
                <th className="py-2">Transporteur</th>
                <th className="py-2">Produit</th>
                <th className="py-2">Quantité perdue</th>
                <th className="py-2">Valeur</th>
                <th className="py-2">Achat</th>
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
                    <td className="py-2">{new Date(loss.created_at).toLocaleString("fr-FR")}</td>
                    <td className="py-2">{transporter?.name ?? "—"}</td>
                    <td className="py-2">{productInfo?.name ?? "—"}</td>
                    <td className="py-2">
                      {loss.quantity_lost} {productInfo?.unit ?? ""}
                    </td>
                    <td className="py-2">
                      {(loss.quantity_lost * loss.unit_cost).toLocaleString("fr-FR")} FCFA
                    </td>
                    <td className="py-2">
                      <Link
                        to={`/purchases/${loss.purchase_id}`}
                        className="text-brand-600 hover:underline"
                      >
                        Voir l'achat
                      </Link>
                    </td>
                    <td className="py-2 text-right">
                      <Button
                        variant="secondary"
                        onClick={() =>
                          void generateCreditNotePdf({
                            purchaseId: loss.purchase_id,
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
              {losses.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-4 text-center text-gray-400">
                    Aucune perte enregistrée.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
