import { useState } from "react";
import { useAuth } from "@/auth/useAuth";
import { useEmployees, useSetEmployeeActive } from "@/features/payroll/useEmployees";
import { EmployeeForm } from "@/features/payroll/EmployeeForm";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export function EmployeesPage() {
  const { hasAttribution } = useAuth();
  const { data: employees, isLoading, error } = useEmployees();
  const setEmployeeActive = useSetEmployeeActive();
  const canManage = hasAttribution("paie.gerer");
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleToggleActive(employeeId: string, name: string, active: boolean) {
    const confirmed = window.confirm(
      active
        ? `Réactiver ${name} ? Il pourra de nouveau être choisi pour un nouveau bulletin de paie.`
        : `Archiver ${name} ? Il ne sera plus proposé pour un nouveau bulletin de paie. Les bulletins déjà émis restent intacts et consultables.`,
    );
    if (!confirmed) return;
    setActionError(null);
    try {
      await setEmployeeActive.mutateAsync({ employeeId, active });
    } catch {
      setActionError("Modification du statut refusée (droits insuffisants).");
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-bold text-forest-900">Employés</h1>

      {canManage && (
        <Card>
          <EmployeeForm />
        </Card>
      )}

      {actionError && <p className="text-sm text-red-600">{actionError}</p>}

      <Card>
        {isLoading && <p className="text-sm text-gray-500">Chargement…</p>}
        {error && <p className="text-sm text-red-600">Impossible de charger les employés.</p>}
        {employees && (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th scope="col" className="py-2">Nom</th>
                <th scope="col" className="py-2">Poste</th>
                <th scope="col" className="py-2">Salaire de base</th>
                <th scope="col" className="py-2">Charges de famille</th>
                <th scope="col" className="py-2">Statut</th>
                {canManage && <th scope="col" className="py-2" />}
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => (
                <tr key={employee.id} className="border-b border-gray-100">
                  <td className="py-2">{employee.full_name}</td>
                  <td className="py-2">{employee.position ?? "—"}</td>
                  <td className="py-2">{employee.base_salary.toLocaleString("fr-FR")} FCFA</td>
                  <td className="py-2">{employee.family_dependents}</td>
                  <td className="py-2">{employee.active ? "Actif" : "Archivé"}</td>
                  {canManage && (
                    <td className="py-2">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() =>
                          void handleToggleActive(employee.id, employee.full_name, !employee.active)
                        }
                      >
                        {employee.active ? "Archiver" : "Réactiver"}
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
              {employees.length === 0 && (
                <tr>
                  <td colSpan={canManage ? 6 : 5} className="py-4 text-center text-gray-500">
                    Aucun employé pour le moment.
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
