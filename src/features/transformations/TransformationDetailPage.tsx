import { Link, useNavigate, useParams } from "react-router-dom";
import { useTransformation } from "@/features/transformations/useTransformations";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export function TransformationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: transformation, isLoading, error } = useTransformation(id);

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
    products: { id: string; name: string } | { id: string; name: string }[] | null;
  }[];
  const outputs = transformation.transformation_outputs as {
    id: string;
    quantity: number;
    unit_cost: number;
    products: { id: string; name: string } | { id: string; name: string }[] | null;
  }[];
  const total = outputs.reduce((sum, item) => sum + item.quantity * item.unit_cost, 0);
  const totalInputQty = inputs.reduce((sum, item) => sum + item.quantity, 0);
  const totalOutputQty = outputs.reduce((sum, item) => sum + item.quantity, 0);
  const rendement = totalInputQty > 0 ? (totalOutputQty / totalInputQty) * 100 : null;
  const creatorRelation = transformation.users as { email: string } | { email: string }[] | null;
  const creatorEmail = Array.isArray(creatorRelation)
    ? creatorRelation[0]?.email
    : creatorRelation?.email;
  const warehouseRelation = transformation.warehouses as
    { name: string } | { name: string }[] | null;
  const warehouseName = Array.isArray(warehouseRelation)
    ? warehouseRelation[0]?.name
    : warehouseRelation?.name;

  function productName(
    product: { id: string; name: string } | { id: string; name: string }[] | null,
  ) {
    return Array.isArray(product) ? product[0]?.name : product?.name;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/transformations" className="text-sm text-brand-600 hover:underline">
          ← Retour aux transformations
        </Link>
      </div>

      <div>
        <h1 className="text-lg font-semibold text-gray-800">
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
        </p>
        <p className="mt-1 text-xs text-gray-400">
          Ratio en nombre d'unités (les produits n'ont pas d'unité de mesure standardisée dans cette
          version) — pas un rendement massique réel.
        </p>
      </Card>

      <Card>
        <h2 className="mb-2 text-sm font-medium text-gray-700">Intrants consommés</h2>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500">
              <th className="py-2">Produit</th>
              <th className="py-2">Quantité</th>
            </tr>
          </thead>
          <tbody>
            {inputs.map((item) => (
              <tr key={item.id} className="border-b border-gray-100">
                <td className="py-2">{productName(item.products) ?? "Produit supprimé"}</td>
                <td className="py-2">{item.quantity}</td>
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
              <th className="py-2">Produit</th>
              <th className="py-2">Quantité</th>
              <th className="py-2">Coût unitaire</th>
              <th className="py-2">Sous-total</th>
            </tr>
          </thead>
          <tbody>
            {outputs.map((item) => (
              <tr key={item.id} className="border-b border-gray-100">
                <td className="py-2">{productName(item.products) ?? "Produit supprimé"}</td>
                <td className="py-2">{item.quantity}</td>
                <td className="py-2">{item.unit_cost.toLocaleString("fr-FR")} FCFA</td>
                <td className="py-2">
                  {(item.unit_cost * item.quantity).toLocaleString("fr-FR")} FCFA
                </td>
              </tr>
            ))}
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

      <Button variant="secondary" onClick={() => navigate("/transformations")}>
        Retour
      </Button>
    </div>
  );
}
