import { useState } from "react";
import { useUsersReport } from "@/features/reports/useUsersReport";
import { Card } from "@/components/ui/Card";
import { ReportExportButton } from "@/components/reports/ReportExportButton";
import { ROLE_LABELS } from "@/lib/roles";
import { exportRowsToExcel } from "@/lib/xlsx";

export function UsersReport() {
  const [active, setActive] = useState<"" | "true" | "false">("");

  const { data: users, isLoading, error } = useUsersReport({
    active: active === "" ? undefined : active === "true",
  });

  function rows() {
    return (users ?? []).map((u) => {
      const roleRelation = u.roles as { name: string } | { name: string }[] | null;
      const role = Array.isArray(roleRelation) ? roleRelation[0] : roleRelation;
      const companyRelation = u.companies as { name: string } | { name: string }[] | null;
      const company = Array.isArray(companyRelation) ? companyRelation[0] : companyRelation;
      return {
        id: u.id,
        identifiant: u.login ?? u.email,
        poste: role?.name ? (ROLE_LABELS[role.name as keyof typeof ROLE_LABELS] ?? role.name) : "—",
        societe: company?.name ?? "—",
        createdAt: u.created_at,
        active: u.active,
      };
    });
  }

  async function handleExportExcel() {
    await exportRowsToExcel(
      `etat-utilisateurs-${new Date().toISOString().slice(0, 10)}.xlsx`,
      [
        { header: "Identifiant", key: "identifiant" },
        { header: "Poste", key: "poste" },
        { header: "Société", key: "societe" },
        { header: "Créé le", key: "creeLe" },
        { header: "Statut", key: "statut" },
      ],
      rows().map((r) => ({
        identifiant: r.identifiant,
        poste: r.poste,
        societe: r.societe,
        creeLe: new Date(r.createdAt).toLocaleDateString("fr-FR"),
        statut: r.active ? "Actif" : "Archivé",
      })),
    );
  }

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-800">Utilisateurs</h2>
        <ReportExportButton onExport={handleExportExcel} disabled={!users || users.length === 0} />
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="users-report-active" className="mb-1 block text-xs font-medium text-gray-600">
            Statut
          </label>
          <select
            id="users-report-active"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            value={active}
            onChange={(e) => setActive(e.target.value as "" | "true" | "false")}
          >
            <option value="">Tous</option>
            <option value="true">Actif</option>
            <option value="false">Archivé</option>
          </select>
        </div>
      </div>

      {isLoading && <p className="text-sm text-gray-500">Chargement…</p>}
      {error && <p className="text-sm text-red-600">Impossible de charger les utilisateurs.</p>}
      {users && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th scope="col" className="py-2 pr-3">Identifiant</th>
                <th scope="col" className="py-2 pr-3">Poste</th>
                <th scope="col" className="py-2 pr-3">Société</th>
                <th scope="col" className="py-2 pr-3">Créé le</th>
                <th scope="col" className="py-2">Statut</th>
              </tr>
            </thead>
            <tbody>
              {rows().map((r) => (
                <tr key={r.id} className="border-b border-gray-100">
                  <td className="py-2 pr-3">{r.identifiant}</td>
                  <td className="py-2 pr-3">{r.poste}</td>
                  <td className="py-2 pr-3">{r.societe}</td>
                  <td className="py-2 pr-3">{new Date(r.createdAt).toLocaleDateString("fr-FR")}</td>
                  <td className="py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        r.active ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"
                      }`}
                    >
                      {r.active ? "Actif" : "Archivé"}
                    </span>
                  </td>
                </tr>
              ))}
              {rows().length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-gray-500">
                    Aucun utilisateur trouvé pour ces filtres.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
