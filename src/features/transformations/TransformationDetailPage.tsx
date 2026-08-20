import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";
import { useTransformation } from "@/features/transformations/useTransformations";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatNumber } from "@/lib/format";

export function TransformationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasAttribution } = useAuth();
  const { data: transformation, isLoading, error } = useTransformation(id);
  const canViewLandedCost = hasAttribution("comptabilite.consulter_prix_revient", "consultative");

  if (isLoading) return <p className="text-sm text-gray-500">Chargement…</p>;
  if (error || !transformation) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-red-600">Transformation introuvable ou accès refusé.</p>
        <Link to="/transformations" className="text-sm text-brand-600 hover:underline">
          ← Retour aux transformations
        </Link>
      </div>
    );
  }

  const inputs = transformation.transformation_inputs as {
    id: string;
    quantity: number;
    products:
      | { id: string; name: string; unit: string }
      | { id: string; name: string; unit: string }[]
      | null;
  }[];
  const outputs = transformation.transformation_outputs as {
    id: string;
    quantity: number;
    unit_cost: number;
    products:
      | { id: string; name: string; unit: string }
      | { id: string; name: string; unit: string }[]
      | null;
  }[];
  const total = outputs.reduce((sum, item) => sum + item.quantity * item.unit_cost, 0);
  const totalInputQty = inputs.reduce((sum, item) => sum + item.quantity, 0);
  const totalOutputQty = outputs.reduce((sum, item) => sum + item.quantity, 0);
  const creatorRelation = transformation.users as { email: string } | { email: string }[] | null;
  const creatorEmail = Array.isArray(creatorRelation)
    ? creatorRelation[0]?.email
    : creatorRelation?.email;
  const warehouseRelation = transformation.warehouses as
    { name: string } | { name: string }[] | null;
  const warehouseName = Array.isArray(warehouseRelation)
    ? warehouseRelation[0]?.name
    : warehouseRelation?.name;

  function productInfo(
    product:
      | { id: string; name: string; unit: string }
      | { id: string; name: string; unit: string }[]
      | null,
  ) {
    return Array.isArray(product) ? product[0] : product;
  }

  const allUnits = new Set([
    ...inputs.map((item) => productInfo(item.products)?.unit),
    ...outputs.map((item) => productInfo(item.products)?.unit),
  ]);
  const sameUnit = allUnits.size === 1;
  const rendement = sameUnit && totalInputQty > 0 ? (totalOutputQty / totalInputQty) * 100 : null;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/transformations" className="text-sm text-brand-600 hover:underline">
          ← Retour aux transformations
        </Link>
      </div>

      <div>
        <h1 className="text-lg font-bold text-forest-900">
          Transformation #{transformation.id.slice(0, 8)}
        </h1>
        <p className="text-sm text-gray-500">
          Créée le {new Date(transformation.created_at).toLocaleString("fr-FR")} par{" "}
          {creatorEmail ?? "utilisateur inconnu"} — Magasin : {warehouseName ?? "—"}
        </p>
      </div>

      <Card>
        <h2 className="mb-2 text-sm font-medium text-gray-700">Rendement</h2>
        <p className="text-sm text-gray-800">
          {totalOutputQty} extrant{totalOutputQty > 1 ? "s" : ""} pour {totalInputQty} intrant
          {totalInputQty > 1 ? "s" : ""}
          {rendement !== null && (
            <span className="ml-1 font-semibold">
              ({rendement.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}%)
            </span>
          )}
          {!sameUnit && <span className="ml-1 text-gray-500">(unités différentes)</span>}
        </p>
        <p className="mt-1 text-xs text-gray-500">
          {sameUnit
            ? "Ratio de quantités (extrants/intrants) — pas un rendement massique réel."
            : "Non calculable : les intrants et extrants ne partagent pas la même unité de mesure."}
        </p>
      </Card>

      <Card>
        <h2 className="mb-2 text-sm font-medium text-gray-700">Intrants consommés</h2>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500">
              <th scope="col" className="py-2">Produit</th>
              <th scope="col" className="py-2">Quantité</th>
            </tr>
          </thead>
          <tbody>
            {inputs.map((item) => (
              <tr key={item.id} className="border-b border-gray-100">
                <td className="py-2">{productInfo(item.products)?.name ?? "Produit supprimé"}</td>
                <td className="py-2">
                  {item.quantity} {productInfo(item.products)?.unit ?? ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <h2 className="mb-2 text-sm font-medium text-gray-700">Produits obtenus</h2>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500">
              <th scope="col" className="py-2">Produit</th>
              <th scope="col" className="py-2">Quantité</th>
              {canViewLandedCost && (
                <>
                  <th scope="col" className="py-2">Coût unitaire</th>
                  <th scope="col" className="py-2">Sous-total</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {outputs.map((item) => (
              <tr key={item.id} className="border-b border-gray-100">
                <td className="py-2">{productInfo(item.products)?.name ?? "Produit supprimé"}</td>
                <td className="py-2">
                  {item.quantity} {productInfo(item.products)?.unit ?? ""}
                </td>
                {canViewLandedCost && (
                  <>
                    <td className="py-2">{formatNumber(item.unit_cost)} FCFA</td>
                    <td className="py-2">
                      {formatNumber((item.unit_cost * item.quantity))} FCFA
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
          {canViewLandedCost && (
            <tfoot>
              <tr>
                <td colSpan={2} className="pt-3 text-right text-sm font-medium text-gray-700">
                  Total
                </td>
                <td colSpan={2} className="pt-3 text-sm font-semibold text-gray-900">
                  {formatNumber(total)} FCFA
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </Card>

      <Button variant="secondary" onClick={() => navigate("/transformations")}>
        Retour
      </Button>
    </div>
  );
}
