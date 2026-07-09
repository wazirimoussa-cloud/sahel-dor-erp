import { useAuth } from "@/auth/useAuth";
import { useClients } from "@/features/clients/useClients";
import { ClientForm } from "@/features/clients/ClientForm";
import { Card } from "@/components/ui/Card";

export function ClientsPage() {
  const { profile } = useAuth();
  const { data: clients, isLoading, error } = useClients();
  const canManage = profile?.role === "admin" || profile?.role === "manager";

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-gray-800">Clients</h1>

      {canManage && (
        <Card>
          <ClientForm />
        </Card>
      )}

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
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.id} className="border-b border-gray-100">
                  <td className="py-2">{client.name}</td>
                  <td className="py-2">{client.contact_name ?? "—"}</td>
                  <td className="py-2">{client.phone ?? "—"}</td>
                  <td className="py-2">{client.email ?? "—"}</td>
                </tr>
              ))}
              {clients.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-gray-400">
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
