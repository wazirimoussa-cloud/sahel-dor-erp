import { Link, useNavigate, useParams } from "react-router-dom";
import { useProduction } from "@/features/productions/useProductions";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export function ProductionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: production, isLoading, error } = useProduction(id);

  if (isLoading) return <p className="text-sm text-gray-500">Chargement…</p>;
  if (error || !production) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-red-600">Production introuvable ou accès refusé.</p>
        <Link to="/productions" className="text-sm text-brand-600 hover:underline">
          ← Retour aux productions
        </Link>
      </div>
    );
  }

  const items = production.production_items as {
    id: string;
    quantity: number;
    unit_cost: number;
    products:
      | { id: string; name: string; unit: string }
      | { id: string; name: string; unit: string }[]
      | null;
  }[];
  const total = items.reduce((sum, item) => sum + item.quantity * item.unit_cost, 0);
  const creatorRelation = production.users as { email: string } | { email: string }[] | null;
  const creatorEmail = Array.isArray(creatorRelation) ? creatorRelation[0]?.email : creatorRelation?.email;
  const warehouseRelation = production.warehouses as { name: string } | { name: string }[] | null;
  const warehouseName = Array.isArray(warehouseRelation)
    ? warehouseRelation[0]?.name
    : warehouseRelation?.name;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/productions" className="text-sm text-brand-600 hover:underline">
          ← Retour aux productions
        </Link>
      </div>

      <div>
        <h1 className="text-lg font-semibold text-gray-800">Production #{production.id.slice(0, 8)}</h1>
        <p className="text-sm text-gray-500">
          Créée le {new Date(production.created_at).toLocaleString("fr-FR")} par{" "}
          {creatorEmail ?? "utilisateur inconnu"} — Magasin : {warehouseName ?? "—"}
        </p>
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
              const productInfo = Array.isArray(product) ? product[0] : product;
              return (
                <tr key={item.id} className="border-b border-gray-100">
                  <td className="py-2">{productInfo?.name ?? "Produit supprimé"}</td>
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

      <Button variant="secondary" onClick={() => navigate("/productions")}>
        Retour
      </Button>
    </div>
  );
}
