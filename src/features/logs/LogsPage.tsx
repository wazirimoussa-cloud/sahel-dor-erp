import { Fragment, useState } from "react";
import { useLogs } from "@/features/logs/useLogs";
import { Card } from "@/components/ui/Card";

const ACTION_LABELS: Record<string, string> = {
  INSERT: "Création",
  UPDATE: "Modification",
  DELETE: "Suppression",
  VIEW: "Consultation",
};

// metadata est l'instantané complet de la ligne (OLD pour DELETE, NEW sinon) — pas un
// diff champ par champ (contrairement à product_price_history/fiscal_rate_history, dédiés
// à 2 écrans précis). Pour une UPDATE, c'est donc l'état après modification, pas
// l'ancien vs le nouveau — suffisant pour "qu'est-ce que ça vaut maintenant", pas pour
// "qu'est-ce qui a changé exactement" sans comparer à l'entrée précédente du même id.
function MetadataDetails({ metadata }: { metadata: Record<string, unknown> | null }) {
  if (!metadata) return <p className="text-xs text-gray-500">Aucun détail disponible.</p>;
  const entries = Object.entries(metadata).filter(([key]) => key !== "id");
  return (
    <table className="w-full text-left text-xs text-gray-600">
      <tbody>
        {entries.map(([key, value]) => (
          <tr key={key} className="border-b border-gray-100">
            <td className="py-1 pr-3 font-medium text-gray-500">{key}</td>
            <td className="py-1">
              {value === null ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function LogsPage() {
  const { data: logs, isLoading, error } = useLogs();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-bold text-forest-900">Journal d'audit</h1>
      <p className="text-sm text-gray-500">
        Écritures (création/modification/suppression) journalisées automatiquement par
        des triggers côté base de données ; consultations (action "VIEW") journalisées à
        chaque changement de page. Aucune entrée ne peut être modifiée ou supprimée
        depuis l'application. "Détails" affiche l'état complet de la ligne au moment de
        l'écriture (pas un ancien/nouveau comparé, sauf pour les taux fiscaux qui ont leur
        propre historique dédié sur l'écran Paramètres fiscaux).
      </p>

      <Card>
        {isLoading && <p className="text-sm text-gray-500">Chargement…</p>}
        {error && <p className="text-sm text-red-600">Impossible de charger le journal.</p>}
        {logs && (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th scope="col" className="py-2">Date</th>
                <th scope="col" className="py-2">Utilisateur</th>
                <th scope="col" className="py-2">Module</th>
                <th scope="col" className="py-2">Action</th>
                <th scope="col" className="py-2" />
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const userRelation = log.users as { email: string } | { email: string }[] | null;
                const email = Array.isArray(userRelation) ? userRelation[0]?.email : userRelation?.email;
                const isExpanded = expandedId === log.id;
                return (
                  <Fragment key={log.id}>
                    <tr className="border-b border-gray-100">
                      <td className="py-2">{new Date(log.created_at).toLocaleString("fr-FR")}</td>
                      <td className="py-2">{email ?? "système"}</td>
                      <td className="py-2">{log.module}</td>
                      <td className="py-2">{ACTION_LABELS[log.action] ?? log.action}</td>
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          className="text-xs text-gray-500 hover:underline"
                          onClick={() => setExpandedId(isExpanded ? null : log.id)}
                        >
                          {isExpanded ? "Masquer" : "Détails"}
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <td colSpan={5} className="py-2 pl-4">
                          <MetadataDetails metadata={log.metadata as Record<string, unknown> | null} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-gray-500">
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
