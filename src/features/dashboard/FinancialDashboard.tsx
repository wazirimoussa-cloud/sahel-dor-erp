import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/Card";
import { DashboardHeader } from "@/features/dashboard/DashboardHeader";
import { useFinancialStatements } from "@/features/financials/useFinancialStatements";
import { useMonthlyActivity } from "@/features/dashboard/useMonthlyActivity";
import { useLowStockProducts } from "@/features/dashboard/useLowStockProducts";

function formatFcfa(value: number | undefined) {
  return `${Math.round(value ?? 0).toLocaleString("fr-FR")} FCFA`;
}

// Admin / Contrôleur / Comptable : vue d'ensemble financière (bilan simplifié + activité
// commerciale) — les seuls rôles avec une vision transverse de la société.
export function FinancialDashboard() {
  const today = new Date().toISOString().slice(0, 10);
  const startOfYear = `${new Date().getFullYear()}-01-01`;
  const { data: statements, isLoading: statementsLoading } = useFinancialStatements(
    startOfYear,
    today,
  );
  const { data: monthlyActivity, isLoading: chartLoading } = useMonthlyActivity();
  const { data: lowStockProducts, isLoading: alertsLoading } = useLowStockProducts();

  return (
    <div className="space-y-6">
      <DashboardHeader subtitle="Vision financière et commerciale de la société" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card accent="forest">
          <p className="text-xs uppercase text-gray-500">Valeur du stock</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-gray-800">
            {statementsLoading ? "…" : formatFcfa(statements?.balanceSheet.actif.stock)}
          </p>
        </Card>
        <Card accent="gold">
          <p className="text-xs uppercase text-gray-500">Créances clients</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-gray-800">
            {statementsLoading ? "…" : formatFcfa(statements?.balanceSheet.actif.clients)}
          </p>
        </Card>
        <Card accent="red">
          <p className="text-xs uppercase text-gray-500">Dettes fournisseurs</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-gray-800">
            {statementsLoading ? "…" : formatFcfa(statements?.balanceSheet.passif.fournisseurs)}
          </p>
        </Card>
        <Card accent="forest">
          <p className="text-xs uppercase text-gray-500">Position de trésorerie</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-gray-800">
            {statementsLoading ? "…" : formatFcfa(statements?.balanceSheet.actif.tresorerie)}
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-brand-600">
            Activité — 6 derniers mois
          </p>
          {chartLoading ? (
            <p className="text-sm text-gray-500">Chargement…</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyActivity}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e9decb" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
                />
                <Tooltip formatter={(value) => formatFcfa(Number(value))} />
                <Legend />
                <Bar dataKey="ventes" name="Ventes" fill="#1c3524" radius={[3, 3, 0, 0]} />
                <Bar dataKey="achats" name="Achats" fill="#c8901f" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-600">
            Alertes stock bas
          </p>
          {alertsLoading ? (
            <p className="text-sm text-gray-500">Chargement…</p>
          ) : lowStockProducts && lowStockProducts.length > 0 ? (
            <ul className="space-y-2 text-sm text-gray-700">
              {lowStockProducts.map((p) => (
                <li key={p.id} className="flex justify-between border-b border-gray-100 pb-1">
                  <span>{p.name}</span>
                  <span className="font-medium text-red-600">
                    {p.stock} {p.unit}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">Aucune alerte. Tous les niveaux sont sains.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
