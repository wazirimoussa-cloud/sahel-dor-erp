import { Fragment, useState } from "react";
import { useAuditLogReport } from "@/features/reports/useAuditLogReport";
import { useUsersReport } from "@/features/reports/useUsersReport";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { ReportDateRangeFilter } from "@/components/reports/ReportDateRangeFilter";
import { ReportExportButton } from "@/components/reports/ReportExportButton";
import { exportRowsToExcel } from "@/lib/xlsx";

const ACTION_LABELS: Record<string, string> = {
  INSERT: "Création",
  UPDATE: "Modification",
  DELETE: "Suppression",
  VIEW: "Consultation",
};

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

export function AuditLogReport() {
  const { data: users } = useUsersReport({});
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [userId, setUserId] = useState("");
  const [module, setModule] = useState("");
  const [action, setAction] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading, error } = useAuditLogReport({
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    userId: userId || undefined,
    module: module || undefined,
    action: action || undefined,
  });
  const logs = data?.rows;

  async function handleExportExcel() {
    if (!logs) return;
    await exportRowsToExcel(
      `etat-journal-audit-${new Date().toISOString().slice(0, 10)}.xlsx`,
      [
        { header: "Date", key: "date" },
        { header: "Utilisateur", key: "utilisateur" },
        { header: "Module", key: "module" },
        { header: "Action", key: "action" },
      ],
      logs.map((log) => {
        const userRelation = log.users as { email: string } | { email: string }[] | null;
        const email = Array.isArray(userRelation) ? userRelation[0]?.email : userRelation?.email;
        return {
          date: new Date(log.created_at).toLocaleString("fr-FR"),
          utilisateur: email ?? "système",
          module: log.module,
          action: ACTION_LABELS[log.action] ?? log.action,
        };
      }),
    );
  }

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-800">Journal d'audit</h2>
        <ReportExportButton onExport={handleExportExcel} disabled={!logs || logs.length === 0} />
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <ReportDateRangeFilter
          idPrefix="audit-log-report"
          startDate={dateFrom}
          endDate={dateTo}
          onStartDateChange={setDateFrom}
          onEndDateChange={setDateTo}
        />
        <div>
          <label htmlFor="audit-log-report-userId" className="mb-1 block text-xs font-medium text-gray-600">
            Utilisateur
          </label>
          <select
            id="audit-log-report-userId"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          >
            <option value="">Tous les utilisateurs</option>
            {users?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.login ?? u.email}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="audit-log-report-module" className="mb-1 block text-xs font-medium text-gray-600">
            Module
          </label>
          <Input
            id="audit-log-report-module"
            type="text"
            className="w-36"
            placeholder="ex. purchases"
            value={module}
            onChange={(e) => setModule(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="audit-log-report-action" className="mb-1 block text-xs font-medium text-gray-600">
            Action
          </label>
          <select
            id="audit-log-report-action"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            value={action}
            onChange={(e) => setAction(e.target.value)}
          >
            <option value="">Toutes</option>
            {Object.entries(ACTION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {data?.capped && (
        <p className="mb-3 text-xs text-amber-600">
          Aucun filtre n'est posé — affichage limité aux {logs?.length} entrées les plus
          récentes. Filtrez par période, utilisateur, module ou action pour voir l'ensemble
          des résultats correspondants.
        </p>
      )}

      {isLoading && <p className="text-sm text-gray-500">Chargement…</p>}
      {error && <p className="text-sm text-red-600">Impossible de charger le journal d'audit.</p>}
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
                  Aucune entrée trouvée pour ces filtres.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </Card>
  );
}
