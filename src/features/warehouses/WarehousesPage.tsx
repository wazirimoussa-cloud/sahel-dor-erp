import { useAuth } from "@/auth/useAuth";
import { useWarehouses } from "@/features/warehouses/useWarehouses";
import { WarehouseForm } from "@/features/warehouses/WarehouseForm";
import { Card } from "@/components/ui/Card";

export function WarehousesPage() {
  const { profile } = useAuth();
  const { data: warehouses, isLoading, error } = useWarehouses();
  const canManage = profile?.role === "admin" || profile?.role === "manager";

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-gray-800">Magasins</h1>

      {canManage && (
        <Card>
          <WarehouseForm />
        </Card>
      )}

      <Card>
        {isLoading && <p className="text-sm text-gray-500">Chargement…</p>}
        {error && <p className="text-sm text-red-600">Impossible de charger les magasins.</p>}
        {warehouses && (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="py-2">Nom</th>
                <th className="py-2">Emplacement</th>
              </tr>
            </thead>
            <tbody>
              {warehouses.map((warehouse) => (
                <tr key={warehouse.id} className="border-b border-gray-100">
                  <td className="py-2">{warehouse.name}</td>
                  <td className="py-2">{warehouse.location ?? "—"}</td>
                </tr>
              ))}
              {warehouses.length === 0 && (
                <tr>
                  <td colSpan={2} className="py-4 text-center text-gray-400">
                    Aucun magasin pour le moment.
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
