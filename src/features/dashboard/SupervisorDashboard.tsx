import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { StatTile, type StatTileDelta, type StatTileStatus } from "@/components/ui/StatTile";
import { DashboardHeader } from "@/features/dashboard/DashboardHeader";
import { useSupervisorPeriodSummary } from "@/features/dashboard/useSupervisorPeriodSummary";
import { formatNumber } from "@/lib/format";
import { defaultStartDate, defaultEndDate, priorPeriod } from "@/lib/dateRange";

const BUSINESS_TIMEZONE_OFFSET_HOURS = 1; // Africa/Lagos, UTC+1 fixe sans DST
const BUSINESS_DAY_START_HOUR = 8;
const BUSINESS_DAY_END_HOUR = 18;
const AUTO_CANCEL_BUDGET_HOURS = 48; // 0083_annulation_automatique_bon_commande.sql
const URGENT_THRESHOLD_HOURS = AUTO_CANCEL_BUDGET_HOURS - 8; // < 8h ouvrées restantes = urgente

// Port fidèle de fn_business_hours_elapsed (0083_annulation_automatique_bon_commande.sql) :
// heures ouvrées (lundi-samedi, 8h-18h, Africa/Lagos) écoulées depuis `sinceIso`. À garder en
// synchronisation si la fonction SQL change -- même algorithme, même fuseau fixe.
function businessHoursElapsed(sinceIso: string): number {
  const offsetMs = BUSINESS_TIMEZONE_OFFSET_HOURS * 3_600_000;
  const since = new Date(new Date(sinceIso).getTime() + offsetMs);
  const end = new Date(Date.now() + offsetMs);
  if (end <= since) return 0;

  let total = 0;
  const day = new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), since.getUTCDate()));
  const endDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  let iterations = 0;

  while (day.getTime() <= endDay.getTime() && iterations < 60) {
    iterations += 1;
    const isoDow = day.getUTCDay() === 0 ? 7 : day.getUTCDay(); // 1=lundi..7=dimanche
    if (isoDow >= 1 && isoDow <= 6) {
      const dayStart = new Date(day.getTime() + BUSINESS_DAY_START_HOUR * 3_600_000);
      const dayEnd = new Date(day.getTime() + BUSINESS_DAY_END_HOUR * 3_600_000);
      const overlapStart = new Date(Math.max(dayStart.getTime(), since.getTime()));
      const overlapEnd = new Date(Math.min(dayEnd.getTime(), end.getTime()));
      if (overlapEnd > overlapStart) {
        total += (overlapEnd.getTime() - overlapStart.getTime()) / 3_600_000;
      }
    }
    day.setUTCDate(day.getUTCDate() + 1);
  }

  return total;
}

function formatFcfa(value: number | undefined | null) {
  return `${formatNumber(Math.round(value ?? 0))} FCFA`;
}

function formatRatio(value: number | null | undefined, suffix: string) {
  return value === null || value === undefined
    ? "—"
    : `${value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}${suffix}`;
}

// Le delta ne montre jamais une couleur bonne/mauvaise implicite -- seul `status` sur
// StatTile porte ce jugement. Même helper que les 6 dashboards précédents.
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

// Instantané "à l'instant présent" (comportement identique à avant) : les commandes qui
// attendent la validation du superviseur -- c'est le seul rôle habilité à déclencher la
// sortie de stock + l'écriture comptable (voir validate_order).
function useSupervisorSnapshot() {
  return useQuery({
    queryKey: ["dashboard-supervisor-snapshot"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, created_at, clients(name), order_items(quantity, unit_price)")
        .eq("status", "pending")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function SupervisorDashboard() {
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const prior = priorPeriod(startDate, endDate);

  const { data: pendingOrders, isLoading: snapshotLoading } = useSupervisorSnapshot();
  const { data: summary, isLoading: summaryLoading } = useSupervisorPeriodSummary(startDate, endDate);
  const { data: priorSummary } = useSupervisorPeriodSummary(prior.startDate, prior.endDate);

  const totalPendingValue = (pendingOrders ?? []).reduce((sum, o) => {
    const items = o.order_items as { quantity: number; unit_price: number }[];
    return sum + items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  }, 0);

  const urgentCount = (pendingOrders ?? []).filter(
    (o) => businessHoursElapsed(o.created_at) >= URGENT_THRESHOLD_HOURS,
  ).length;
  const urgentStatus: StatTileStatus | undefined =
    pendingOrders === undefined ? undefined : urgentCount > 0 ? "critical" : "ok";

  const cancellationRatePct = summary?.cancellationRate == null ? null : summary.cancellationRate * 100;
  const priorCancellationRatePct =
    priorSummary?.cancellationRate == null ? null : priorSummary.cancellationRate * 100;
  const cancellationStatus: StatTileStatus | undefined =
    cancellationRatePct === null ? undefined : cancellationRatePct > 40 ? "critical" : cancellationRatePct > 20 ? "warning" : "ok";

  return (
    <div className="space-y-6">
      <DashboardHeader subtitle="Bons de commande en attente de validation" />

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="supervisordash-startDate" className="mb-1 block text-xs font-medium text-gray-600">
              Période — du
            </label>
            <Input
              id="supervisordash-startDate"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="supervisordash-endDate" className="mb-1 block text-xs font-medium text-gray-600">
              au
            </label>
            <Input
              id="supervisordash-endDate"
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
            label="Commandes validées"
            value={formatRatio(summary?.validatedCount, "")}
            loading={summaryLoading}
            delta={computeDelta(
              summary?.validatedCount,
              priorSummary?.validatedCount,
              (diff) => `${Math.round(diff)}`,
            )}
            href="/orders"
          />
          <StatTile
            label="Commandes annulées"
            value={formatRatio(summary?.cancelledCount, "")}
            loading={summaryLoading}
            delta={computeDelta(
              summary?.cancelledCount,
              priorSummary?.cancelledCount,
              (diff) => `${Math.round(diff)}`,
            )}
            href="/orders"
          />
          <StatTile
            label="Taux d'annulation"
            value={formatRatio(cancellationRatePct, " %")}
            loading={summaryLoading}
            status={cancellationStatus}
            delta={computeDelta(cancellationRatePct, priorCancellationRatePct, (diff) => `${diff.toFixed(1)} pts`)}
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
            label="Bons de commande à valider"
            value={formatRatio(pendingOrders?.length, "")}
            loading={snapshotLoading}
            href="/orders"
          />
          <StatTile
            label="Montant total HT en attente"
            value={formatFcfa(totalPendingValue)}
            loading={snapshotLoading}
            href="/orders"
          />
          <StatTile
            label="Proches de l'annulation automatique"
            value={formatRatio(urgentCount, "")}
            loading={snapshotLoading}
            status={urgentStatus}
            href="/orders"
          />
        </div>
      </div>

      <Card>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-600">
          À valider (les plus anciennes d'abord)
        </p>
        {snapshotLoading ? (
          <p className="text-sm text-gray-500">Chargement…</p>
        ) : pendingOrders && pendingOrders.length > 0 ? (
          <ul className="space-y-2 text-sm text-gray-700">
            {pendingOrders.map((o) => {
              const client = o.clients as { name: string } | { name: string }[] | null;
              const clientName = Array.isArray(client) ? client[0]?.name : client?.name;
              const items = o.order_items as { quantity: number; unit_price: number }[];
              const total = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
              const isUrgent = businessHoursElapsed(o.created_at) >= URGENT_THRESHOLD_HOURS;
              return (
                <li key={o.id} className="flex items-center justify-between border-b border-gray-100 pb-1">
                  <div>
                    <span>{clientName ?? "—"}</span>
                    <span className="ml-2 text-xs text-gray-500">
                      {new Date(o.created_at).toLocaleDateString("fr-FR")}
                    </span>
                    {isUrgent && (
                      <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">
                        Urgente
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-gray-600">
                      {formatNumber(Math.round(total))} FCFA
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
          <p className="text-sm text-gray-500">Aucun bon de commande en attente de validation.</p>
        )}
      </Card>
    </div>
  );
}
