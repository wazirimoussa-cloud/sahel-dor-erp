import { useLogs } from "@/features/logs/useLogs";
import { Card } from "@/components/ui/Card";

export function LogsPage() {
  const { data: logs, isLoading, error } = useLogs();

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-gray-800">Journal d'audit</h1>
      <p className="text-sm text-gray-500">
        Alimenté automatiquement par des triggers côté base de données (voir
        supabase/migrations/0002_functions_triggers.sql) — aucune entrée ne peut être écrite ou
        modifiée depuis l'application.
      </p>

      <Card>
        {isLoading && <p className="text-sm text-gray-500">Chargement…</p>}
        {error && <p className="text-sm text-red-600">Impossible de charger le journal.</p>}
        {logs && (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="py-2">Date</th>
                <th className="py-2">Utilisateur</th>
                <th className="py-2">Module</th>
                <th className="py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const userRelation = log.users as { email: string } | { email: string }[] | null;
                const email = Array.isArray(userRelation) ? userRelation[0]?.email : userRelation?.email;
                return (
                  <tr key={log.id} className="border-b border-gray-100">
                    <td className="py-2">{new Date(log.created_at).toLocaleString("fr-FR")}</td>
                    <td className="py-2">{email ?? "système"}</td>
                    <td className="py-2">{log.module}</td>
                    <td className="py-2">{log.action}</td>
                  </tr>
                );
              })}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-gray-400">
                    Aucune entrée pour le moment.
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
