import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { StatTile, type StatTileDelta, type StatTileStatus } from "@/components/ui/StatTile";
import { DashboardHeader } from "@/features/dashboard/DashboardHeader";
import { useLogisticsPeriodSummary } from "@/features/dashboard/useLogisticsPeriodSummary";
import { formatNumber } from "@/lib/format";
import { defaultStartDate, defaultEndDate, priorPeriod } from "@/lib/dateRange";

// 2ᵉ occurrence seulement avec StockLossRequestsPage.tsx (pas encore la règle des trois
// occurrences) -- pas d'extraction pour l'instant, cohérent avec orderDisplay.ts/
// purchaseDisplay.ts qui n'ont été extraits qu'à la 3ᵉ occurrence.
const STOCK_LOSS_STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  approved: "Approuvée",
  rejected: "Rejetée",
};

const STOCK_LOSS_STATUS_CLASSES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

function formatFcfa(value: number | undefined | null) {
  return `${formatNumber(Math.round(value ?? 0))} FCFA`;
}

function formatRatio(value: number | null | undefined, suffix: string) {
  return value === null || value === undefined
    ? "—"
    : `${value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}${suffix}`;
}

// Le delta ne montre jamais une couleur bonne/mauvaise implicite -- seul `status` sur
// StatTile porte ce jugement. Même helper que les 5 dashboards précédents.
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

function relationName(rel: { name: string } | { name: string }[] | null) {
  return Array.isArray(rel) ? rel[0]?.name : rel?.name;
}

// Instantané "à l'instant présent" (comportement identique à avant, étendu à pertes_stock) :
// transporteurs, dernières pertes constatées à la réception, pertes de stock en attente
// d'approbation, dernières pertes de stock déclarées.
function useLogisticsSnapshot() {
  return useQuery({
    queryKey: ["dashboard-logistics-snapshot"],
    queryFn: async () => {
      const [transporters, recentLosses, pendingStockLosses, recentStockLossRequests] = await Promise.all([
        supabase.from("transporters").select("id", { count: "exact", head: true }),
        supabase
          .from("purchase_losses")
          .select("id, quantity_lost, unit_cost, created_at, purchase_id, products(name, unit), transporters(name)")
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("stock_loss_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
        supabase
          .from("stock_loss_requests")
          .select("id, quantity, status, created_at, products(name, unit), warehouses(name)")
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      return {
        transportersCount: transporters.count ?? 0,
        recentLosses: recentLosses.data ?? [],
        pendingStockLossCount: pendingStockLosses.count ?? 0,
        recentStockLossRequests: recentStockLossRequests.data ?? [],
      };
    },
  });
}

// Logistique / Transport : pertes constatées à la réception (transporteurs) et pertes de
// stock déclarées en magasin (pertes_stock) -- pas de vision financière sur les pertes de
// stock (aucun coût unitaire réel sur cette table, contrairement à purchase_losses ; voir
// useLogisticsPeriodSummary.ts). Le dashboard est visible via hasModuleAccess("transporteurs")
// || hasModuleAccess("pertes_stock") (condition OU entre deux modules distincts, même cas que
// Production) -- chaque carte et chaque lien de navigation est gardé individuellement.
export function LogisticsDashboard() {
  const { hasModuleAccess } = useAuth();
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const prior = priorPeriod(startDate, endDate);

  const { data: snapshot, isLoading: snapshotLoading } = useLogisticsSnapshot();
  const { data: summary, isLoading: summaryLoading } = useLogisticsPeriodSummary(startDate, endDate);
  const { data: priorSummary } = useLogisticsPeriodSummary(prior.startDate, prior.endDate);

  const canSeeTransporteurs = hasModuleAccess("transporteurs");
  const canSeePertesStock = hasModuleAccess("pertes_stock");
  const canSeeAchats = hasModuleAccess("achats");

  const rejectionRate = summary?.approvalRate == null ? null : (1 - summary.approvalRate) * 100;
  const approvalStatus: StatTileStatus | undefined =
    rejectionRate === null ? undefined : rejectionRate > 40 ? "critical" : rejectionRate > 20 ? "warning" : "ok";

  return (
    <div className="space-y-6">
      <DashboardHeader subtitle="Transport et pertes constatées" />

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="logisticsdash-startDate" className="mb-1 block text-xs font-medium text-gray-600">
              Période — du
            </label>
            <Input
              id="logisticsdash-startDate"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="logisticsdash-endDate" className="mb-1 block text-xs font-medium text-gray-600">
              au
            </label>
            <Input
              id="logisticsdash-endDate"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <p className="text-xs text-gray-500">
            Comparaison à la période précédente de même durée (
            {new Date(prior.startDate).toLocaleDateString("fr-FR")} –{" "}
            {new Date(prior.endDate).toLocaleDateString("fr-FR")}).
          </p>
        </div>
      </Card>

      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-600">
          Activité de la période
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Pertes constatées (réception)"
            value={formatRatio(summary?.lossesCount, "")}
            loading={summaryLoading}
            delta={computeDelta(summary?.lossesCount, priorSummary?.lossesCount, (diff) => `${Math.round(diff)}`)}
            href={canSeeTransporteurs ? "/pertes-transport" : undefined}
          />
          <StatTile
            label="Valeur des pertes (réception)"
            value={formatFcfa(summary?.lossesValue)}
            loading={summaryLoading}
            delta={computeDelta(summary?.lossesValue, priorSummary?.lossesValue, formatFcfa)}
            href={canSeeTransporteurs ? "/pertes-transport" : undefined}
          />
          <StatTile
            label="Pertes de stock déclarées"
            value={formatRatio(summary?.declaredCount, "")}
            loading={summaryLoading}
            delta={computeDelta(
              summary?.declaredCount,
              priorSummary?.declaredCount,
              (diff) => `${Math.round(diff)}`,
            )}
            href={canSeePertesStock ? "/pertes-stock" : undefined}
          />
          <StatTile
            label="Taux d'approbation"
            value={formatRatio(summary?.approvalRate == null ? null : summary.approvalRate * 100, " %")}
            loading={summaryLoading}
            status={approvalStatus}
            delta={computeDelta(
              summary?.approvalRate == null ? null : summary.approvalRate * 100,
              priorSummary?.approvalRate == null ? null : priorSummary.approvalRate * 100,
              (diff) => `${diff.toFixed(1)} pts`,
            )}
            secondaryLine={{
              label: "Délai moyen d'approbation",
              value: formatRatio(summary?.avgApprovalDelayDays, " j"),
            }}
            href={canSeePertesStock ? "/pertes-stock" : undefined}
          />
        </div>
      </div>

      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-600">
          Position actuelle
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StatTile
            label="Transporteurs"
            value={formatRatio(snapshot?.transportersCount, "")}
            loading={snapshotLoading}
            href={canSeeTransporteurs ? "/transporteurs" : undefined}
          />
          <StatTile
            label="Pertes de stock en attente d'approbation"
            value={formatRatio(snapshot?.pendingStockLossCount, "")}
            loading={snapshotLoading}
            href={canSeePertesStock ? "/pertes-stock" : undefined}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-600">
            Dernières pertes (réception)
          </p>
          {snapshotLoading ? (
            <p className="text-sm text-gray-500">Chargement…</p>
          ) : snapshot && snapshot.recentLosses.length > 0 ? (
            <ul className="space-y-2 text-sm text-gray-700">
              {snapshot.recentLosses.map((l) => {
                const product = l.products as { name: string; unit: string } | { name: string; unit: string }[] | null;
                const productInfo = Array.isArray(product) ? product[0] : product;
                const transporterName = relationName(l.transporters);
                return (
                  <li key={l.id} className="flex items-center justify-between border-b border-gray-100 pb-1">
                    <div>
                      <span>
                        {productInfo?.name ?? "—"} — {transporterName ?? "—"}
                      </span>
                      <span className="ml-2 text-xs text-gray-500">
                        {new Date(l.created_at).toLocaleDateString("fr-FR")}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-red-600">
                        {l.quantity_lost} {productInfo?.unit ?? ""}
                      </span>
                      {canSeeAchats ? (
                        <Link to={`/purchases/${l.purchase_id}`} className="text-brand-600 hover:underline">
                          Voir
                        </Link>
                      ) : (
                        <span className="text-xs text-gray-400">Voir</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">Aucune perte constatée pour le moment.</p>
          )}
        </Card>

        <Card>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-600">
            Dernières pertes de stock déclarées
          </p>
          {snapshotLoading ? (
            <p className="text-sm text-gray-500">Chargement…</p>
          ) : snapshot && snapshot.recentStockLossRequests.length > 0 ? (
            <ul className="space-y-2 text-sm text-gray-700">
              {snapshot.recentStockLossRequests.map((r) => {
                const product = r.products as { name: string; unit: string } | { name: string; unit: string }[] | null;
                const productInfo = Array.isArray(product) ? product[0] : product;
                const warehouseNameValue = relationName(r.warehouses);
                return (
                  <li key={r.id} className="flex items-center justify-between border-b border-gray-100 pb-1">
                    <div>
                      <span>
                        {productInfo?.name ?? "—"} — {warehouseNameValue ?? "—"}
                      </span>
                      <span className="ml-2 text-xs text-gray-500">
                        {new Date(r.created_at).toLocaleDateString("fr-FR")}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-600">
                        {r.quantity} {productInfo?.unit ?? ""}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${STOCK_LOSS_STATUS_CLASSES[r.status] ?? ""}`}
                      >
                        {STOCK_LOSS_STATUS_LABELS[r.status] ?? r.status}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">Aucune déclaration de perte pour le moment.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
