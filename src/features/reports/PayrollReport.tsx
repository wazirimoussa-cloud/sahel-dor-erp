import { useState } from "react";
import { usePayslipsReport, useSalaryAdvancesReport, useLeaveRecordsReport } from "@/features/reports/usePayrollReport";
import { useActiveEmployees } from "@/features/payroll/useEmployees";
import { LEAVE_TYPE_LABELS } from "@/features/payroll/LeaveRecordForm";
import { Card } from "@/components/ui/Card";
import { ReportDateRangeFilter } from "@/components/reports/ReportDateRangeFilter";
import { ReportExportButton } from "@/components/reports/ReportExportButton";
import { formatNumber } from "@/lib/format";
import { exportRowsToExcel } from "@/lib/xlsx";

function relation<T>(value: T | T[] | null): T | undefined {
  return Array.isArray(value) ? value[0] : (value ?? undefined);
}

// Un seul filtre période + employé partagé par les trois sous-tableaux (Bulletins, Avances,
// Congés) -- même esprit que PayePage.tsx, qui affiche déjà les trois sur une seule page.
export function PayrollReport() {
  const { data: employees } = useActiveEmployees();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [employeeId, setEmployeeId] = useState("");

  const filters = { dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, employeeId: employeeId || undefined };
  const { data: payslips } = usePayslipsReport(filters);
  const { data: advances } = useSalaryAdvancesReport(filters);
  const { data: leaveRecords } = useLeaveRecordsReport(filters);

  async function handleExportPayslips() {
    if (!payslips) return;
    await exportRowsToExcel(
      `etat-paie-bulletins-${new Date().toISOString().slice(0, 10)}.xlsx`,
      [
        { header: "Mois", key: "mois" },
        { header: "Employé", key: "employe" },
        { header: "Brut (FCFA)", key: "brut" },
        { header: "Pension (FCFA)", key: "pension" },
        { header: "ITS (FCFA)", key: "its" },
        { header: "Net (FCFA)", key: "net" },
      ],
      payslips.map((p) => ({
        mois: new Date(p.period).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }),
        employe: relation(p.employees)?.full_name ?? "—",
        brut: Math.round(p.gross_salary),
        pension: Math.round(p.pension_withholding),
        its: Math.round(p.its_withholding),
        net: Math.round(p.net_pay),
      })),
    );
  }

  async function handleExportAdvances() {
    if (!advances) return;
    await exportRowsToExcel(
      `etat-paie-avances-${new Date().toISOString().slice(0, 10)}.xlsx`,
      [
        { header: "Date", key: "date" },
        { header: "Employé", key: "employe" },
        { header: "Montant (FCFA)", key: "montant" },
        { header: "Motif", key: "motif" },
        { header: "Statut", key: "statut" },
      ],
      advances.map((a) => ({
        date: new Date(a.advance_date).toLocaleDateString("fr-FR"),
        employe: relation(a.employees)?.full_name ?? "—",
        montant: Math.round(a.amount),
        motif: a.reason ?? "—",
        statut: relation(a.payslips) ? "Remboursée" : "En attente",
      })),
    );
  }

  async function handleExportLeaves() {
    if (!leaveRecords) return;
    await exportRowsToExcel(
      `etat-paie-conges-${new Date().toISOString().slice(0, 10)}.xlsx`,
      [
        { header: "Employé", key: "employe" },
        { header: "Type", key: "type" },
        { header: "Début", key: "debut" },
        { header: "Fin", key: "fin" },
        { header: "Motif", key: "motif" },
      ],
      leaveRecords.map((r) => ({
        employe: relation(r.employees)?.full_name ?? "—",
        type: LEAVE_TYPE_LABELS[r.type],
        debut: new Date(r.start_date).toLocaleDateString("fr-FR"),
        fin: new Date(r.end_date).toLocaleDateString("fr-FR"),
        motif: r.reason ?? "—",
      })),
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="mb-3 text-base font-semibold text-gray-800">Paie — filtres</h2>
        <div className="flex flex-wrap items-end gap-3">
          <ReportDateRangeFilter
            idPrefix="payroll-report"
            startDate={dateFrom}
            endDate={dateTo}
            onStartDateChange={setDateFrom}
            onEndDateChange={setDateTo}
          />
          <div>
            <label htmlFor="payroll-report-employeeId" className="mb-1 block text-xs font-medium text-gray-600">
              Employé
            </label>
            <select
              id="payroll-report-employeeId"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            >
              <option value="">Tous les employés</option>
              {employees?.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Le filtre de période s'applique au mois du bulletin, à la date de l'avance, ou au
          début du congé, selon le sous-tableau.
        </p>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-gray-800">Bulletins de paie</h2>
          <ReportExportButton onExport={handleExportPayslips} disabled={!payslips || payslips.length === 0} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th scope="col" className="py-2 pr-3">Mois</th>
                <th scope="col" className="py-2 pr-3">Employé</th>
                <th scope="col" className="py-2 pr-3">Brut</th>
                <th scope="col" className="py-2 pr-3">Pension</th>
                <th scope="col" className="py-2 pr-3">ITS</th>
                <th scope="col" className="py-2">Net</th>
              </tr>
            </thead>
            <tbody>
              {payslips?.map((p) => (
                <tr key={p.id} className="border-b border-gray-100">
                  <td className="py-2 pr-3">
                    {new Date(p.period).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
                  </td>
                  <td className="py-2 pr-3">{relation(p.employees)?.full_name ?? "—"}</td>
                  <td className="py-2 pr-3">{formatNumber(p.gross_salary)} FCFA</td>
                  <td className="py-2 pr-3">{formatNumber(p.pension_withholding)} FCFA</td>
                  <td className="py-2 pr-3">{formatNumber(p.its_withholding)} FCFA</td>
                  <td className="py-2 font-semibold">{formatNumber(p.net_pay)} FCFA</td>
                </tr>
              ))}
              {payslips?.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-gray-500">
                    Aucun bulletin trouvé pour ces filtres.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-gray-800">Avances sur salaire</h2>
          <ReportExportButton onExport={handleExportAdvances} disabled={!advances || advances.length === 0} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th scope="col" className="py-2 pr-3">Date</th>
                <th scope="col" className="py-2 pr-3">Employé</th>
                <th scope="col" className="py-2 pr-3">Montant</th>
                <th scope="col" className="py-2 pr-3">Motif</th>
                <th scope="col" className="py-2">Statut</th>
              </tr>
            </thead>
            <tbody>
              {advances?.map((a) => (
                <tr key={a.id} className="border-b border-gray-100">
                  <td className="py-2 pr-3">{new Date(a.advance_date).toLocaleDateString("fr-FR")}</td>
                  <td className="py-2 pr-3">{relation(a.employees)?.full_name ?? "—"}</td>
                  <td className="py-2 pr-3">{formatNumber(a.amount)} FCFA</td>
                  <td className="py-2 pr-3">{a.reason ?? "—"}</td>
                  <td className="py-2">{relation(a.payslips) ? "Remboursée" : "En attente"}</td>
                </tr>
              ))}
              {advances?.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-gray-500">
                    Aucune avance trouvée pour ces filtres.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-gray-800">Congés / absences</h2>
          <ReportExportButton onExport={handleExportLeaves} disabled={!leaveRecords || leaveRecords.length === 0} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th scope="col" className="py-2 pr-3">Employé</th>
                <th scope="col" className="py-2 pr-3">Type</th>
                <th scope="col" className="py-2 pr-3">Début</th>
                <th scope="col" className="py-2 pr-3">Fin</th>
                <th scope="col" className="py-2">Motif</th>
              </tr>
            </thead>
            <tbody>
              {leaveRecords?.map((r) => (
                <tr key={r.id} className="border-b border-gray-100">
                  <td className="py-2 pr-3">{relation(r.employees)?.full_name ?? "—"}</td>
                  <td className="py-2 pr-3">{LEAVE_TYPE_LABELS[r.type]}</td>
                  <td className="py-2 pr-3">{new Date(r.start_date).toLocaleDateString("fr-FR")}</td>
                  <td className="py-2 pr-3">{new Date(r.end_date).toLocaleDateString("fr-FR")}</td>
                  <td className="py-2">{r.reason ?? "—"}</td>
                </tr>
              ))}
              {leaveRecords?.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-gray-500">
                    Aucun congé/absence trouvé pour ces filtres.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
