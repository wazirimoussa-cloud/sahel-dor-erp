import { useAuth } from "@/auth/useAuth";
import { useTransporters } from "@/features/transporters/useTransporters";
import { TransporterForm } from "@/features/transporters/TransporterForm";
import { Card } from "@/components/ui/Card";

export function TransportersPage() {
  const { hasAttribution } = useAuth();
  const { data: transporters, isLoading, error } = useTransporters();
  const canManage = hasAttribution("transporteurs.gerer");

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-bold text-forest-900">Transporteurs</h1>

      {canManage && (
        <Card>
          <TransporterForm />
        </Card>
      )}

      <Card>
        {isLoading && <p className="text-sm text-gray-500">Chargement…</p>}
        {error && <p className="text-sm text-red-600">Impossible de charger les transporteurs.</p>}
        {transporters && (
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
              {transporters.map((transporter) => (
                <tr key={transporter.id} className="border-b border-gray-100">
                  <td className="py-2">{transporter.name}</td>
                  <td className="py-2">{transporter.contact_name ?? "—"}</td>
                  <td className="py-2">{transporter.phone ?? "—"}</td>
                  <td className="py-2">{transporter.email ?? "—"}</td>
                </tr>
              ))}
              {transporters.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-gray-400">
                    Aucun transporteur pour le moment.
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
