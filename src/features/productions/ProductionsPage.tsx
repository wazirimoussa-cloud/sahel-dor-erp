import { Link } from "react-router-dom";
import { useProductions } from "@/features/productions/useProductions";
import { NewProductionForm } from "@/features/productions/NewProductionForm";
import { Card } from "@/components/ui/Card";

export function ProductionsPage() {
  const { data: productions, isLoading, error } = useProductions();

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-gray-800">Production</h1>

      <Card>
        <NewProductionForm />
      </Card>

      <Card>
        {isLoading && <p className="text-sm text-gray-500">Chargement…</p>}
        {error && <p className="text-sm text-red-600">Impossible de charger les productions.</p>}
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500">
              <th className="py-2">Date</th>
              <th className="py-2">Magasin</th>
              <th className="py-2">Lignes</th>
              <th className="py-2">Valeur</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {productions?.map((production) => {
              const items = production.production_items as { quantity: number; unit_cost: number }[];
              const total = items.reduce((sum, item) => sum + item.quantity * item.unit_cost, 0);
              const warehouseRelation = production.warehouses as
                | { name: string }
                | { name: string }[]
                | null;
              const warehouseName = Array.isArray(warehouseRelation)
                ? warehouseRelation[0]?.name
                : warehouseRelation?.name;
              return (
                <tr key={production.id} className="border-b border-gray-100">
                  <td className="py-2">{new Date(production.created_at).toLocaleString("fr-FR")}</td>
                  <td className="py-2">{warehouseName ?? "—"}</td>
                  <td className="py-2">{items.length}</td>
                  <td className="py-2">{total.toLocaleString("fr-FR")} FCFA</td>
                  <td className="py-2 text-right">
                    <Link to={`/productions/${production.id}`} className="text-brand-600 hover:underline">
                      Voir le détail
                    </Link>
                  </td>
                </tr>
              );
            })}
            {productions?.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-gray-400">
                  Aucune production pour le moment.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
