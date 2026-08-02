import { useAuth } from "@/auth/useAuth";
import { usePayslips } from "@/features/payroll/usePayslips";
import { NewPayslipForm } from "@/features/payroll/NewPayslipForm";
import { useSalaryAdvances } from "@/features/payroll/useSalaryAdvances";
import { SalaryAdvanceForm } from "@/features/payroll/SalaryAdvanceForm";
import { Card } from "@/components/ui/Card";

function relation<T>(value: T | T[] | null): T | undefined {
  return Array.isArray(value) ? value[0] : (value ?? undefined);
}

export function PayePage() {
  const { hasAttribution } = useAuth();
  const { data: payslips, isLoading, error } = usePayslips();
  const { data: advances, isLoading: advancesLoading, error: advancesError } = useSalaryAdvances();
  const canManage = hasAttribution("paie.gerer");

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
                <th className="py-2">Mois</th>
                <th className="py-2">Employé</th>
                <th className="py-2">Brut</th>
                <th className="py-2">Pension</th>
                <th className="py-2">ITS</th>
                <th className="py-2">Avance remboursée</th>
                <th className="py-2">Net</th>
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
                  <td colSpan={7} className="py-4 text-center text-gray-400">
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
                <th className="py-2">Date</th>
                <th className="py-2">Employé</th>
                <th className="py-2">Montant</th>
                <th className="py-2">Motif</th>
                <th className="py-2">Statut</th>
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
                  <td colSpan={5} className="py-4 text-center text-gray-400">
                    Aucune avance pour le moment.
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
