import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { StatTile, type StatTileDelta, type StatTileStatus } from "@/components/ui/StatTile";
import { DashboardHeader } from "@/features/dashboard/DashboardHeader";
import { useTopClients } from "@/features/dashboard/useTopClients";
import { useSalesPeriodSummary } from "@/features/dashboard/useSalesPeriodSummary";
import { ORDER_STATUS_LABELS, ORDER_STATUS_CLASSES } from "@/lib/orderDisplay";
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

// Le delta ne montre jamais une couleur bonne/mauvaise implicite -- seul `status` sur
// StatTile porte ce jugement. `direction` ne pilote que le glyphe. (Même helper que
// FinancialDashboard.tsx -- pas extrait, cohérent avec formatFcfa déjà dupliqué page par
// page dans cet app.)
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

// Instantané "à l'instant présent" (pas borné à la période choisie, comportement identique
// à avant) : en attente / impayés / clients / commandes récentes.
function useSalesSnapshot() {
  return useQuery({
    queryKey: ["dashboard-sales-snapshot"],
    queryFn: async () => {
      const [pendingOrders, clients, unpaidOrders, nonCancelledOrders, recentOrders] =
        await Promise.all([
          supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "pending"),
          supabase.from("clients").select("id", { count: "exact", head: true }),
          supabase.from("orders").select("id", { count: "exact", head: true }).eq("payment_status", "unpaid"),
          supabase.from("orders").select("id", { count: "exact", head: true }).neq("status", "cancelled"),
          supabase
            .from("orders")
            .select("id, status, payment_status, created_at, clients(name)")
            .order("created_at", { ascending: false })
            .limit(5),
        ]);

      return {
        pendingCount: pendingOrders.count ?? 0,
        clientsCount: clients.count ?? 0,
        unpaidCount: unpaidOrders.count ?? 0,
        nonCancelledCount: nonCancelledOrders.count ?? 0,
        recentOrders: recentOrders.data ?? [],
      };
    },
  });
}

// Opérateur de vente : ses commandes et l'état de leur validation/paiement — pas de
// vision financière ni de stock (hors de son périmètre RBAC).
export function SalesDashboard() {
  const { hasModuleAccess } = useAuth();
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const prior = priorPeriod(startDate, endDate);

  const { data: snapshot, isLoading: snapshotLoading } = useSalesSnapshot();
  const { data: summary, isLoading: summaryLoading } = useSalesPeriodSummary(startDate, endDate);
  const { data: priorSummary } = useSalesPeriodSummary(prior.startDate, prior.endDate);
  const { data: topClients, isLoading: topClientsLoading } = useTopClients(startDate, endDate);

  const canSeeClients = hasModuleAccess("clients");
  const canSeeUsers = hasModuleAccess("utilisateurs");

  const unpaidRate =
    snapshot && snapshot.nonCancelledCount > 0 ? (snapshot.unpaidCount / snapshot.nonCancelledCount) * 100 : null;
  const unpaidStatus: StatTileStatus | undefined =
    unpaidRate === null ? undefined : unpaidRate > 40 ? "critical" : unpaidRate > 20 ? "warning" : "ok";

  return (
    <div className="space-y-6">
      <DashboardHeader subtitle="Bons de commande et clients" />

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="salesdash-startDate" className="mb-1 block text-xs font-medium text-gray-600">
              Période — du
            </label>
            <Input
              id="salesdash-startDate"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="salesdash-endDate" className="mb-1 block text-xs font-medium text-gray-600">
              au
            </label>
            <Input
              id="salesdash-endDate"
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatTile
            label="Chiffre d'affaires"
            value={formatFcfa(summary?.totalCA)}
            loading={summaryLoading}
            delta={computeDelta(summary?.totalCA, priorSummary?.totalCA, formatFcfa)}
            href="/orders"
          />
          <StatTile
            label="Panier moyen"
            value={formatFcfa(summary?.averageBasket)}
            loading={summaryLoading}
            delta={computeDelta(summary?.averageBasket, priorSummary?.averageBasket, formatFcfa)}
            href="/orders"
          />
          <StatTile
            label="Bons de commande validés"
            value={formatRatio(summary?.orderCount, "")}
            loading={summaryLoading}
            delta={computeDelta(summary?.orderCount, priorSummary?.orderCount, (diff) => `${Math.round(diff)}`)}
            href="/orders"
          />
        </div>
      </div>

      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-600">
          Position actuelle
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatTile
            label="Bons de commande en attente"
            value={formatRatio(snapshot?.pendingCount, "")}
            loading={snapshotLoading}
            href="/orders"
          />
          <StatTile
            label="Bons de commande impayés"
            value={formatRatio(snapshot?.unpaidCount, "")}
            loading={snapshotLoading}
            status={unpaidStatus}
            secondaryLine={{ label: "Taux d'impayés", value: formatRatio(unpaidRate, " %") }}
            href="/orders"
          />
          <StatTile
            label="Clients"
            value={formatRatio(snapshot?.clientsCount, "")}
            loading={snapshotLoading}
            href={canSeeClients ? "/clients" : undefined}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-600">
            Bons de commande récents
          </p>
          {snapshotLoading ? (
            <p className="text-sm text-gray-500">Chargement…</p>
          ) : snapshot && snapshot.recentOrders.length > 0 ? (
            <ul className="space-y-2 text-sm text-gray-700">
              {snapshot.recentOrders.map((o) => {
                const client = o.clients as { name: string } | { name: string }[] | null;
                const clientName = Array.isArray(client) ? client[0]?.name : client?.name;
                return (
                  <li key={o.id} className="flex items-center justify-between border-b border-gray-100 pb-1">
                    <div>
                      <span>{clientName ?? "—"}</span>
                      <span className="ml-2 text-xs text-gray-500">
                        {new Date(o.created_at).toLocaleDateString("fr-FR")}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${ORDER_STATUS_CLASSES[o.status] ?? ""}`}
                      >
                        {ORDER_STATUS_LABELS[o.status] ?? o.status}
                      </span>
                      <Link to={`/orders/${o.id}`} className="text-brand-600 hover:underline">
                        Voir
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">Aucun bon de commande pour le moment.</p>
          )}
        </Card>

        <div className="space-y-4">
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

          <Card>
            {canSeeUsers ? (
              <Link
                to="/users"
                className="mb-3 block text-xs font-semibold uppercase tracking-wide text-brand-600 hover:underline"
              >
                CA par utilisateur (période) →
              </Link>
            ) : (
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-600">
                CA par utilisateur (période)
              </p>
            )}
            {summaryLoading ? (
              <p className="text-sm text-gray-500">Chargement…</p>
            ) : summary && summary.topCreators.length > 0 ? (
              <ul className="space-y-2 text-sm text-gray-700">
                {summary.topCreators.map((c) => (
                  <li key={c.userId} className="flex justify-between border-b border-gray-100 pb-1">
                    <span>{c.email}</span>
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
