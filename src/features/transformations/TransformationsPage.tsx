import { Link } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";
import { useTransformations } from "@/features/transformations/useTransformations";
import { NewTransformationForm } from "@/features/transformations/NewTransformationForm";
import { Card } from "@/components/ui/Card";

export function TransformationsPage() {
  const { profile } = useAuth();
  const { data: transformations, isLoading, error } = useTransformations();
  const canCreate = profile?.role === "production_manager";

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-gray-800">Transformation</h1>

      {canCreate && (
        <Card>
          <NewTransformationForm />
        </Card>
      )}

      <Card>
        {isLoading && <p className="text-sm text-gray-500">Chargement…</p>}
        {error && <p className="text-sm text-red-600">Impossible de charger les transformations.</p>}
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500">
              <th className="py-2">Date</th>
              <th className="py-2">Magasin</th>
              <th className="py-2">Intrants</th>
              <th className="py-2">Extrants</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {transformations?.map((transformation) => {
              const inputs = transformation.transformation_inputs as { quantity: number }[];
              const outputs = transformation.transformation_outputs as { quantity: number }[];
              const warehouseRelation = transformation.warehouses as
                | { name: string }
                | { name: string }[]
                | null;
              const warehouseName = Array.isArray(warehouseRelation)
                ? warehouseRelation[0]?.name
                : warehouseRelation?.name;
              return (
                <tr key={transformation.id} className="border-b border-gray-100">
                  <td className="py-2">
                    {new Date(transformation.created_at).toLocaleString("fr-FR")}
                  </td>
                  <td className="py-2">{warehouseName ?? "—"}</td>
                  <td className="py-2">{inputs.length}</td>
                  <td className="py-2">{outputs.length}</td>
                  <td className="py-2 text-right">
                    <Link
                      to={`/transformations/${transformation.id}`}
                      className="text-brand-600 hover:underline"
                    >
                      Voir le détail
                    </Link>
                  </td>
                </tr>
              );
            })}
            {transformations?.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-gray-400">
                  Aucune transformation pour le moment.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
