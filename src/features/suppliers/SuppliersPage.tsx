import { useState } from "react";
import { useAuth } from "@/auth/useAuth";
import { useSuppliers, useSetSupplierActive } from "@/features/suppliers/useSuppliers";
import { SupplierForm } from "@/features/suppliers/SupplierForm";
import { Card } from "@/components/ui/Card";

export function SuppliersPage() {
  const { hasAttribution } = useAuth();
  const { data: suppliers, isLoading, error } = useSuppliers();
  const setSupplierActive = useSetSupplierActive();
  const canManage = hasAttribution("fournisseurs.gerer");
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleToggleActive(supplierId: string, name: string, active: boolean) {
    const confirmed = window.confirm(
      active
        ? `Réactiver ${name} ? Ce fournisseur pourra de nouveau être choisi pour un nouvel achat.`
        : `Archiver ${name} ? Ce fournisseur ne sera plus proposé pour un nouvel achat. L'historique déjà enregistré reste intact et consultable.`,
    );
    if (!confirmed) return;
    setActionError(null);
    try {
      await setSupplierActive.mutateAsync({ supplierId, active });
    } catch {
      setActionError("Modification du statut refusée (droits insuffisants).");
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-bold text-forest-900">Fournisseurs</h1>

      {canManage && (
        <Card>
          <SupplierForm />
        </Card>
      )}

      {actionError && <p className="text-sm text-red-600">{actionError}</p>}

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
                <th className="py-2">Statut</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {suppliers.map((supplier) => (
                <tr key={supplier.id} className="border-b border-gray-100">
                  <td className="py-2">{supplier.name}</td>
                  <td className="py-2">{supplier.contact_name ?? "—"}</td>
                  <td className="py-2">{supplier.phone ?? "—"}</td>
                  <td className="py-2">{supplier.email ?? "—"}</td>
                  <td className="py-2">
                    {supplier.active ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        Actif
                      </span>
                    ) : (
                      <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600">
                        Archivé
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    {canManage && (
                      <button
                        type="button"
                        className="text-xs text-gray-500 hover:underline"
                        disabled={setSupplierActive.isPending}
                        onClick={() =>
                          void handleToggleActive(supplier.id, supplier.name, !supplier.active)
                        }
                      >
                        {supplier.active ? "Archiver" : "Réactiver"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {suppliers.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-gray-400">
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
