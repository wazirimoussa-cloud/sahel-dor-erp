import { useState } from "react";
import { useAuth } from "@/auth/useAuth";
import { useClients, useSetClientActive } from "@/features/clients/useClients";
import { ClientForm } from "@/features/clients/ClientForm";
import { Card } from "@/components/ui/Card";

export function ClientsPage() {
  const { hasAttribution } = useAuth();
  const { data: clients, isLoading, error } = useClients();
  const setClientActive = useSetClientActive();
  const canManage = hasAttribution("clients.gerer");
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleToggleActive(clientId: string, name: string, active: boolean) {
    const confirmed = window.confirm(
      active
        ? `Réactiver ${name} ? Ce client pourra de nouveau être choisi pour une nouvelle commande.`
        : `Archiver ${name} ? Ce client ne sera plus proposé pour une nouvelle commande. L'historique déjà enregistré reste intact et consultable.`,
    );
    if (!confirmed) return;
    setActionError(null);
    try {
      await setClientActive.mutateAsync({ clientId, active });
    } catch {
      setActionError("Modification du statut refusée (droits insuffisants).");
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-bold text-forest-900">Clients</h1>

      {canManage && (
        <Card>
          <ClientForm />
        </Card>
      )}

      {actionError && <p className="text-sm text-red-600">{actionError}</p>}

      <Card>
        {isLoading && <p className="text-sm text-gray-500">Chargement…</p>}
        {error && <p className="text-sm text-red-600">Impossible de charger les clients.</p>}
        {clients && (
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
              {clients.map((client) => (
                <tr key={client.id} className="border-b border-gray-100">
                  <td className="py-2">{client.name}</td>
                  <td className="py-2">{client.contact_name ?? "—"}</td>
                  <td className="py-2">{client.phone ?? "—"}</td>
                  <td className="py-2">{client.email ?? "—"}</td>
                  <td className="py-2">
                    {client.active ? (
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
                        disabled={setClientActive.isPending}
                        onClick={() =>
                          void handleToggleActive(client.id, client.name, !client.active)
                        }
                      >
                        {client.active ? "Archiver" : "Réactiver"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {clients.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-gray-500">
                    Aucun client pour le moment.
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
