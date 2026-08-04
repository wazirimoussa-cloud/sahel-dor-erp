import { useAuth } from "@/auth/useAuth";
import { useChartOfAccounts } from "@/features/accounting/useChartOfAccounts";
import { ChartOfAccountForm } from "@/features/accounting/ChartOfAccountForm";
import { Card } from "@/components/ui/Card";
import { Pagination } from "@/components/ui/Pagination";
import { usePagination } from "@/lib/usePagination";

export function ChartOfAccountsPage() {
  const { hasAttribution } = useAuth();
  const { page, pageSize, goToPrevious, goToNext } = usePagination();
  const { data, isLoading, error } = useChartOfAccounts(page, pageSize);
  const accounts = data?.rows;
  const canManage = hasAttribution("comptabilite.gerer_plan_comptable");

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-bold text-forest-900">Plan comptable</h1>
      <p className="text-sm text-gray-500">
        Comptes SYSCOHADA minimaux utilisés par les écritures générées automatiquement
        (voir "Journal comptable"). Vous pouvez en ajouter d'autres, mais ils ne seront
        pas utilisés tant qu'aucune écriture automatique ne les référence.
      </p>

      {canManage && (
        <Card>
          <ChartOfAccountForm />
        </Card>
      )}

      <Card>
        {isLoading && <p className="text-sm text-gray-500">Chargement…</p>}
        {error && <p className="text-sm text-red-600">Impossible de charger le plan comptable.</p>}
        {accounts && (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th scope="col" className="py-2">Code</th>
                <th scope="col" className="py-2">Nom</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id} className="border-b border-gray-100">
                  <td className="py-2 font-mono">{account.code}</td>
                  <td className="py-2">{account.name}</td>
                </tr>
              ))}
              {accounts.length === 0 && (
                <tr>
                  <td colSpan={2} className="py-4 text-center text-gray-500">
                    Aucun compte pour le moment.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
        {accounts && (
          <Pagination
            page={page}
            hasNextPage={data?.hasNextPage ?? false}
            onPrevious={goToPrevious}
            onNext={goToNext}
          />
        )}
      </Card>
    </div>
  );
}
