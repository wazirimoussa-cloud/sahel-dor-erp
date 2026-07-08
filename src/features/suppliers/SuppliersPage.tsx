import { useAuth } from "@/auth/useAuth";
import { useSuppliers } from "@/features/suppliers/useSuppliers";
import { SupplierForm } from "@/features/suppliers/SupplierForm";
import { Card } from "@/components/ui/Card";

export function SuppliersPage() {
  const { profile } = useAuth();
  const { data: suppliers, isLoading, error } = useSuppliers();
  const canManage = profile?.role === "admin" || profile?.role === "manager";

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-gray-800">Fournisseurs</h1>

      {canManage && (
        <Card>
          <SupplierForm />
        </Card>
      )}

      <Card>
        {isLoading && <p className="text-sm text-gray-500">Chargement…</p>}
        {error && <p className="text-sm text-red-600">Impossible de charger les fournisseurs.</p>}
        {suppliers && (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="py-2">Nom</th>
                <th className="py-2">Contact</th>
                <th className="py-2">Téléphone</th>
                <th className="py-2">Email</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((supplier) => (
                <tr key={supplier.id} className="border-b border-gray-100">
                  <td className="py-2">{supplier.name}</td>
                  <td className="py-2">{supplier.contact_name ?? "—"}</td>
                  <td className="py-2">{supplier.phone ?? "—"}</td>
                  <td className="py-2">{supplier.email ?? "—"}</td>
                </tr>
              ))}
              {suppliers.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-gray-400">
                    Aucun fournisseur pour le moment.
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
