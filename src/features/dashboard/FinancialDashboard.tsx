import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAuth } from "@/auth/useAuth";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { StatTile, type StatTileDelta, type StatTileStatus } from "@/components/ui/StatTile";
import { DashboardHeader } from "@/features/dashboard/DashboardHeader";
import { useFinancialStatements } from "@/features/financials/useFinancialStatements";
import { useMonthlyActivity } from "@/features/dashboard/useMonthlyActivity";
import { useLowStockProducts } from "@/features/dashboard/useLowStockProducts";
import { useTopClients } from "@/features/dashboard/useTopClients";
import { formatNumber } from "@/lib/format";
import { defaultStartDate, defaultEndDate, priorPeriod } from "@/lib/dateRange";

function formatFcfa(value: number | undefined | null) {
  return `${formatNumber(Math.round(value ?? 0))} FCFA`;
}

function formatRatio(value: number | null | undefined, suffix: string) {
  return value === null || value === undefined
    ? "—"
    : `${value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}${suffix}`;
}

// Le delta ne montre jamais une couleur bonne/mauvaise implicite (une hausse des dettes
// fournisseurs n'est pas "bonne" juste parce que la flèche est verte par convention) --
// seul `status` sur StatTile porte ce jugement. `direction` ne pilote que le glyphe.
function computeDelta(
  current: number | null | undefined,
  prior: number | null | undefined,
  formatDiff: (diff: number) => string,
): StatTileDelta | undefined {
  if (current == null || prior == null) return undefined;
  const diff = current - prior;
  const direction = diff > 0.0001 ? "up" : diff < -0.0001 ? "down" : "flat";
  const sign = diff > 0 ? "+" : "";
  return { value: `${sign}${formatDiff(diff)}`, direction, label: "vs période précédente" };
}

// Admin / Contrôleur / Comptable : vue d'ensemble financière (bilan simplifié + activité
// commerciale) — les seuls rôles avec une vision transverse de la société.
export function FinancialDashboard() {
  const { hasModuleAccess } = useAuth();
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const prior = priorPeriod(startDate, endDate);

  const { data: statements, isLoading: statementsLoading } = useFinancialStatements(
    startDate,
    endDate,
  );
  const { data: priorStatements } = useFinancialStatements(prior.startDate, prior.endDate);
  const { data: monthlyActivity, isLoading: chartLoading } = useMonthlyActivity();
  const { data: lowStockProducts, isLoading: alertsLoading } = useLowStockProducts();
  const { data: topClients, isLoading: topClientsLoading } = useTopClients(startDate, endDate);

  const canSeeEtatsFinanciers = hasModuleAccess("etats_financiers");
  const canSeeJournal = hasModuleAccess("journal_comptable");
  const canSeeClients = hasModuleAccess("clients");

  const margeStatus: StatTileStatus | undefined =
    statements?.ratios.margeCommerciale == null
      ? undefined
      : statements.ratios.margeCommerciale < 0
        ? "critical"
        : statements.ratios.margeCommerciale < 10
          ? "warning"
          : "ok";

  const dsoStatus: StatTileStatus | undefined =
    statements?.ratios.delaiReglementClients == null
      ? undefined
      : statements.ratios.delaiReglementClients > 90
        ? "critical"
        : statements.ratios.delaiReglementClients > 60
          ? "warning"
          : "ok";

  return (
    <div className="space-y-6">
      <DashboardHeader subtitle="Vision financière et commerciale de la société" />

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="findash-startDate" className="mb-1 block text-xs font-medium text-gray-600">
              Période — du
            </label>
            <Input
              id="findash-startDate"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="findash-endDate" className="mb-1 block text-xs font-medium text-gray-600">
              au
            </label>
            <Input
              id="findash-endDate"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <p className="text-xs text-gray-500">
            Comparaison à la période précédente de même durée ({new Date(prior.startDate).toLocaleDateString("fr-FR")} – {new Date(prior.endDate).toLocaleDateString("fr-FR")}).
          </p>
        </div>
      </Card>

      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-600">
          Activité de la période
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Chiffre d'affaires"
            value={formatFcfa(statements?.incomeStatement.produits)}
            loading={statementsLoading}
            delta={computeDelta(
              statements?.incomeStatement.produits,
              priorStatements?.incomeStatement.produits,
              formatFcfa,
            )}
            href={canSeeJournal ? "/journal-comptable" : undefined}
          />
          <StatTile
            label="Résultat net"
            value={formatFcfa(statements?.ratios.resultatNetPeriode)}
            loading={statementsLoading}
            delta={computeDelta(
              statements?.ratios.resultatNetPeriode,
              priorStatements?.ratios.resultatNetPeriode,
              formatFcfa,
            )}
            status={
              statements ? (statements.ratios.resultatNetPeriode < 0 ? "critical" : "ok") : undefined
            }
            href={canSeeEtatsFinanciers ? "/etats-financiers" : undefined}
          />
          <StatTile
            label="Marge commerciale"
            value={formatRatio(statements?.ratios.margeCommerciale, " %")}
            loading={statementsLoading}
            delta={computeDelta(
              statements?.ratios.margeCommerciale,
              priorStatements?.ratios.margeCommerciale,
              (diff) => `${diff.toFixed(1)} pts`,
            )}
            status={margeStatus}
            href={canSeeEtatsFinanciers ? "/etats-financiers" : undefined}
          />
          <StatTile
            label="Rotation des stocks"
            value={formatRatio(statements?.ratios.rotationStockJours, " j")}
            loading={statementsLoading}
            delta={computeDelta(
              statements?.ratios.rotationStockJours,
              priorStatements?.ratios.rotationStockJours,
              (diff) => `${Math.round(diff)} j`,
            )}
            href={canSeeEtatsFinanciers ? "/etats-financiers" : undefined}
          />
        </div>
      </div>

      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-600">
          Position au {new Date(endDate).toLocaleDateString("fr-FR")}
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Trésorerie"
            value={formatFcfa(statements?.balanceSheet.actif.tresorerie)}
            loading={statementsLoading}
            delta={computeDelta(
              statements?.balanceSheet.actif.tresorerie,
              priorStatements?.balanceSheet.actif.tresorerie,
              formatFcfa,
            )}
            status={
              statements
                ? statements.balanceSheet.actif.tresorerie < 0
                  ? "critical"
                  : "ok"
                : undefined
            }
            href={canSeeEtatsFinanciers ? "/etats-financiers" : undefined}
          />
          <StatTile
            label="Créances clients"
            value={formatFcfa(statements?.balanceSheet.actif.clients)}
            loading={statementsLoading}
            delta={computeDelta(
              statements?.balanceSheet.actif.clients,
              priorStatements?.balanceSheet.actif.clients,
              formatFcfa,
            )}
            status={dsoStatus}
            secondaryLine={{
              label: "Délai moyen de règlement",
              value: formatRatio(statements?.ratios.delaiReglementClients, " j"),
            }}
            href={canSeeEtatsFinanciers ? "/etats-financiers" : undefined}
          />
          <StatTile
            label="Dettes fournisseurs"
            value={formatFcfa(statements?.balanceSheet.passif.fournisseurs)}
            loading={statementsLoading}
            delta={computeDelta(
              statements?.balanceSheet.passif.fournisseurs,
              priorStatements?.balanceSheet.passif.fournisseurs,
              formatFcfa,
            )}
            href={canSeeEtatsFinanciers ? "/etats-financiers" : undefined}
          />
          <StatTile
            label="Valeur du stock"
            value={formatFcfa(statements?.balanceSheet.actif.stock)}
            loading={statementsLoading}
            delta={computeDelta(
              statements?.balanceSheet.actif.stock,
              priorStatements?.balanceSheet.actif.stock,
              formatFcfa,
            )}
            href="/stock"
          />
        </div>
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

          <p className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-brand-600">
            Tendance trésorerie — 6 derniers mois
          </p>
          {chartLoading ? (
            <p className="text-sm text-gray-500">Chargement…</p>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={monthlyActivity}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e9decb" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
                />
                <Tooltip formatter={(value) => formatFcfa(Number(value))} />
                <Line
                  type="monotone"
                  dataKey="tresorerie"
                  name="Trésorerie"
                  stroke="#1c3524"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>

        <div className="space-y-4">
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

          <Card>
            {canSeeClients ? (
              <Link
                to="/clients"
                className="mb-3 block text-xs font-semibold uppercase tracking-wide text-brand-600 hover:underline"
              >
                Top clients (période) →
              </Link>
            ) : (
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-600">
                Top clients (période)
              </p>
            )}
            {topClientsLoading ? (
              <p className="text-sm text-gray-500">Chargement…</p>
            ) : topClients && topClients.length > 0 ? (
              <ul className="space-y-2 text-sm text-gray-700">
                {topClients.map((c) => (
                  <li key={c.clientId} className="flex justify-between border-b border-gray-100 pb-1">
                    <span>{c.name}</span>
                    <span className="font-medium text-gray-800">{formatFcfa(c.total)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500">Aucune commande validée sur cette période.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
