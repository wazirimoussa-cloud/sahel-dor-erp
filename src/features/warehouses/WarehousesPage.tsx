import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";
import { useWarehouses, useSetWarehouseActive } from "@/features/warehouses/useWarehouses";
import { WarehouseForm } from "@/features/warehouses/WarehouseForm";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export function WarehousesPage() {
  const { hasAttribution } = useAuth();
  const { data: warehouses, isLoading, error } = useWarehouses();
  const setWarehouseActive = useSetWarehouseActive();
  const canManage = hasAttribution("entrepots.gerer");
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleToggleActive(warehouseId: string, name: string, active: boolean) {
    const confirmed = window.confirm(
      active
        ? `Réactiver ${name} ? Ce magasin pourra de nouveau être choisi pour une nouvelle opération.`
        : `Archiver ${name} ? Ce magasin ne sera plus proposé pour une nouvelle opération (achat, commande, mouvement, transfert...). L'historique déjà enregistré reste intact et consultable.`,
    );
    if (!confirmed) return;
    setActionError(null);
    try {
      await setWarehouseActive.mutateAsync({ warehouseId, active });
    } catch {
      setActionError("Modification du statut refusée (droits insuffisants).");
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-bold text-forest-900">Magasins</h1>

      {canManage && (
        <Card>
          <WarehouseForm />
        </Card>
      )}

      {actionError && <p className="text-sm text-red-600">{actionError}</p>}

      <Card>
        {isLoading && <p className="text-sm text-gray-500">Chargement…</p>}
        {error && <p className="text-sm text-red-600">Impossible de charger les magasins.</p>}
        {warehouses && (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="py-2">Nom</th>
                <th className="py-2">Emplacement</th>
                <th className="py-2">Statut</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {warehouses.map((warehouse) => (
                <tr key={warehouse.id} className="border-b border-gray-100">
                  <td className="py-2">{warehouse.name}</td>
                  <td className="py-2">{warehouse.location ?? "—"}</td>
                  <td className="py-2">
                    {warehouse.active ? (
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
                    <div className="flex justify-end gap-2">
                      <Link
                        to={`/warehouses/${warehouse.id}`}
                        className="text-brand-600 hover:underline"
                      >
                        Voir l'historique
                      </Link>
                      {canManage && (
                        <Button
                          variant="secondary"
                          disabled={setWarehouseActive.isPending}
                          onClick={() =>
                            void handleToggleActive(warehouse.id, warehouse.name, !warehouse.active)
                          }
                        >
                          {warehouse.active ? "Archiver" : "Réactiver"}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {warehouses.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-gray-500">
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
