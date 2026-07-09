import { useAuth } from "@/auth/useAuth";
import { useTransactions } from "@/features/stock/useTransactions";
import { StockMovementForm } from "@/features/stock/StockMovementForm";
import { Card } from "@/components/ui/Card";

const TYPE_LABELS: Record<string, string> = {
  IN: "Entrée",
  OUT: "Sortie",
  ADJUSTMENT: "Ajustement",
};

export function StockPage() {
  const { profile } = useAuth();
  const { data: transactions, isLoading, error } = useTransactions();
  const canRecord =
    profile?.role === "admin" ||
    profile?.role === "logistics" ||
    profile?.role === "production_manager";

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-gray-800">Mouvements de stock</h1>

      {canRecord && (
        <Card>
          <StockMovementForm />
        </Card>
      )}

      <Card>
        {isLoading && <p className="text-sm text-gray-500">Chargement…</p>}
        {error && <p className="text-sm text-red-600">Impossible de charger les mouvements.</p>}
        {transactions && (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="py-2">Date</th>
                <th className="py-2">Produit</th>
                <th className="py-2">Magasin</th>
                <th className="py-2">Type</th>
                <th className="py-2">Quantité</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => {
                const product = tx.products as { name: string } | { name: string }[] | null;
                const productName = Array.isArray(product) ? product[0]?.name : product?.name;
                const warehouse = tx.warehouses as { name: string } | { name: string }[] | null;
                const warehouseName = Array.isArray(warehouse) ? warehouse[0]?.name : warehouse?.name;
                return (
                  <tr key={tx.id} className="border-b border-gray-100">
                    <td className="py-2">{new Date(tx.created_at).toLocaleString("fr-FR")}</td>
                    <td className="py-2">{productName ?? "—"}</td>
                    <td className="py-2">{warehouseName ?? "—"}</td>
                    <td className="py-2">{TYPE_LABELS[tx.type] ?? tx.type}</td>
                    <td className="py-2">{tx.quantity}</td>
                  </tr>
                );
              })}
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-gray-400">
                    Aucun mouvement enregistré.
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
