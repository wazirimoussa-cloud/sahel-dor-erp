import { useState } from "react";
import { useAuth } from "@/auth/useAuth";
import { usePayslips } from "@/features/payroll/usePayslips";
import { NewPayslipForm } from "@/features/payroll/NewPayslipForm";
import { useSalaryAdvances } from "@/features/payroll/useSalaryAdvances";
import { SalaryAdvanceForm } from "@/features/payroll/SalaryAdvanceForm";
import { useLeaveRecords, useDeleteLeaveRecord } from "@/features/payroll/useLeaveRecords";
import { LeaveRecordForm, LEAVE_TYPE_LABELS } from "@/features/payroll/LeaveRecordForm";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

function relation<T>(value: T | T[] | null): T | undefined {
  return Array.isArray(value) ? value[0] : (value ?? undefined);
}

export function PayePage() {
  const { hasAttribution } = useAuth();
  const { data: payslips, isLoading, error } = usePayslips();
  const { data: advances, isLoading: advancesLoading, error: advancesError } = useSalaryAdvances();
  const { data: leaveRecords, isLoading: leaveLoading, error: leaveError } = useLeaveRecords();
  const deleteLeaveRecord = useDeleteLeaveRecord();
  const canManage = hasAttribution("paie.gerer");
  const [leaveActionError, setLeaveActionError] = useState<string | null>(null);

  async function handleDeleteLeave(id: string) {
    const confirmed = window.confirm("Supprimer cet enregistrement de congé/absence ?");
    if (!confirmed) return;
    setLeaveActionError(null);
    try {
      await deleteLeaveRecord.mutateAsync(id);
    } catch {
      setLeaveActionError("Suppression refusée (droits insuffisants).");
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-bold text-forest-900">Paie</h1>

      {canManage && (
        <Card>
          <NewPayslipForm />
        </Card>
      )}

      <Card>
        {isLoading && <p className="text-sm text-gray-500">Chargement…</p>}
        {error && <p className="text-sm text-red-600">Impossible de charger les bulletins de paie.</p>}
        {payslips && (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th scope="col" className="py-2">Mois</th>
                <th scope="col" className="py-2">Employé</th>
                <th scope="col" className="py-2">Brut</th>
                <th scope="col" className="py-2">Pension</th>
                <th scope="col" className="py-2">ITS</th>
                <th scope="col" className="py-2">Avance remboursée</th>
                <th scope="col" className="py-2">Net</th>
              </tr>
            </thead>
            <tbody>
              {payslips.map((payslip) => (
                <tr key={payslip.id} className="border-b border-gray-100">
                  <td className="py-2">
                    {new Date(payslip.period).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
                  </td>
                  <td className="py-2">{relation(payslip.employees)?.full_name}</td>
                  <td className="py-2">{payslip.gross_salary.toLocaleString("fr-FR")} FCFA</td>
                  <td className="py-2">{payslip.pension_withholding.toLocaleString("fr-FR")} FCFA</td>
                  <td className="py-2">{payslip.its_withholding.toLocaleString("fr-FR")} FCFA</td>
                  <td className="py-2">{payslip.advance_repaid_id ? "Oui" : "—"}</td>
                  <td className="py-2 font-semibold">{payslip.net_pay.toLocaleString("fr-FR")} FCFA</td>
                </tr>
              ))}
              {payslips.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-4 text-center text-gray-500">
                    Aucun bulletin de paie pour le moment.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </Card>

      <h2 className="text-base font-bold text-forest-900">Avances sur salaire</h2>

      {canManage && (
        <Card>
          <SalaryAdvanceForm />
        </Card>
      )}

      <Card>
        {advancesLoading && <p className="text-sm text-gray-500">Chargement…</p>}
        {advancesError && <p className="text-sm text-red-600">Impossible de charger les avances.</p>}
        {advances && (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th scope="col" className="py-2">Date</th>
                <th scope="col" className="py-2">Employé</th>
                <th scope="col" className="py-2">Montant</th>
                <th scope="col" className="py-2">Motif</th>
                <th scope="col" className="py-2">Statut</th>
              </tr>
            </thead>
            <tbody>
              {advances.map((advance) => {
                const repaidBy = relation(advance.payslips);
                return (
                  <tr key={advance.id} className="border-b border-gray-100">
                    <td className="py-2">{new Date(advance.advance_date).toLocaleDateString("fr-FR")}</td>
                    <td className="py-2">{relation(advance.employees)?.full_name}</td>
                    <td className="py-2">{advance.amount.toLocaleString("fr-FR")} FCFA</td>
                    <td className="py-2">{advance.reason ?? "—"}</td>
                    <td className="py-2">{repaidBy ? "Remboursée" : "En attente"}</td>
                  </tr>
                );
              })}
              {advances.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-gray-500">
                    Aucune avance pour le moment.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </Card>

      <h2 className="text-base font-bold text-forest-900">Congés / absences</h2>
      <p className="text-xs text-gray-500">
        Registre simple, sans calcul de solde de congés acquis ni lien automatique avec
        la paie — si une absence doit réduire un salaire, ajustez manuellement le
        salaire brut du bulletin concerné.
      </p>

      {canManage && (
        <Card>
          <LeaveRecordForm />
        </Card>
      )}

      {leaveActionError && <p className="text-sm text-red-600">{leaveActionError}</p>}

      <Card>
        {leaveLoading && <p className="text-sm text-gray-500">Chargement…</p>}
        {leaveError && <p className="text-sm text-red-600">Impossible de charger les congés/absences.</p>}
        {leaveRecords && (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th scope="col" className="py-2">Employé</th>
                <th scope="col" className="py-2">Type</th>
                <th scope="col" className="py-2">Début</th>
                <th scope="col" className="py-2">Fin</th>
                <th scope="col" className="py-2">Motif</th>
                {canManage && <th scope="col" className="py-2" />}
              </tr>
            </thead>
            <tbody>
              {leaveRecords.map((record) => (
                <tr key={record.id} className="border-b border-gray-100">
                  <td className="py-2">{relation(record.employees)?.full_name}</td>
                  <td className="py-2">{LEAVE_TYPE_LABELS[record.type]}</td>
                  <td className="py-2">{new Date(record.start_date).toLocaleDateString("fr-FR")}</td>
                  <td className="py-2">{new Date(record.end_date).toLocaleDateString("fr-FR")}</td>
                  <td className="py-2">{record.reason ?? "—"}</td>
                  {canManage && (
                    <td className="py-2">
                      <Button type="button" variant="secondary" onClick={() => void handleDeleteLeave(record.id)}>
                        Supprimer
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
              {leaveRecords.length === 0 && (
                <tr>
                  <td colSpan={canManage ? 6 : 5} className="py-4 text-center text-gray-500">
                    Aucun congé/absence enregistré pour le moment.
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
