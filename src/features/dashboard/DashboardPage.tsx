import { useDashboardStats } from "@/features/dashboard/useDashboardStats";
import { Card } from "@/components/ui/Card";

export function DashboardPage() {
  const { data, isLoading } = useDashboardStats();

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-gray-800">Tableau de bord</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs uppercase text-gray-500">Produits</p>
          <p className="mt-1 text-2xl font-semibold text-gray-800">
            {isLoading ? "…" : data?.productsCount}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase text-gray-500">Stock bas (&lt; 5)</p>
          <p className="mt-1 text-2xl font-semibold text-red-600">
            {isLoading ? "…" : data?.lowStockCount}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase text-gray-500">Commandes en attente</p>
          <p className="mt-1 text-2xl font-semibold text-brand-600">
            {isLoading ? "…" : data?.pendingOrdersCount}
          </p>
        </Card>
      </div>

      <Card>
        <p className="mb-3 text-sm font-medium text-gray-700">Derniers mouvements de stock</p>
        <ul className="space-y-2 text-sm text-gray-600">
          {data?.recentTransactions.map((tx) => {
            const product = tx.products as { name: string } | { name: string }[] | null;
            const productName = Array.isArray(product) ? product[0]?.name : product?.name;
            return (
              <li key={tx.id} className="flex justify-between border-b border-gray-100 pb-1">
                <span>
                  {productName ?? "—"} ({tx.type})
                </span>
                <span>{tx.quantity}</span>
              </li>
            );
          })}
          {data?.recentTransactions.length === 0 && (
            <li className="text-gray-400">Aucun mouvement pour le moment.</li>
          )}
        </ul>
      </Card>
    </div>
  );
}
