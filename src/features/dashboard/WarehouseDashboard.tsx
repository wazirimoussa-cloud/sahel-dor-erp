import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/auth/useAuth";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { StatTile, type StatTileDelta, type StatTileStatus } from "@/components/ui/StatTile";
import { DashboardHeader } from "@/features/dashboard/DashboardHeader";
import { useLowStockProducts } from "@/features/dashboard/useLowStockProducts";
import { useStockRotation } from "@/features/dashboard/useStockRotation";
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
// StatTile porte ce jugement. Même helper que Finance/Ventes (pas extrait, cohérent avec
// formatFcfa déjà dupliqué page par page dans cette app).
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

// Instantané "à l'instant présent" (comportement identique à avant) : réceptions en attente
// et mouvements du jour.
function useWarehouseSnapshot() {
  return useQuery({
    queryKey: ["dashboard-warehouse-stats"],
    queryFn: async () => {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const [pendingPurchases, movementsToday] = await Promise.all([
        supabase.from("purchases").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase
          .from("transactions")
          .select("id", { count: "exact", head: true })
          .gte("created_at", startOfDay.toISOString()),
      ]);

      return {
        pendingPurchasesCount: pendingPurchases.count ?? 0,
        movementsTodayCount: movementsToday.count ?? 0,
      };
    },
  });
}

// Gestionnaire de magasin : ce qui touche au stock physique — niveaux bas, réceptions à
// faire, mouvements du jour. Pas de vision financière (hors de son périmètre RBAC) — la
// rotation des stocks utilise un hook allégé (useStockRotation) qui n'a pas besoin du
// journal comptable, contrairement au calcul équivalent du dashboard Finance.
export function WarehouseDashboard() {
  const { hasModuleAccess } = useAuth();
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const prior = priorPeriod(startDate, endDate);

  const { data: stats, isLoading: statsLoading } = useWarehouseSnapshot();
  const { data: lowStockProducts, isLoading: alertsLoading } = useLowStockProducts();
  const { data: rotation, isLoading: rotationLoading } = useStockRotation(startDate, endDate);
  const { data: priorRotation } = useStockRotation(prior.startDate, prior.endDate);

  const canSeeAchats = hasModuleAccess("achats");
  const lowStockCount = lowStockProducts?.length ?? 0;
  const lowStockStatus: StatTileStatus | undefined =
    lowStockProducts === undefined ? undefined : lowStockCount > 0 ? "critical" : "ok";

  return (
    <div className="space-y-6">
      <DashboardHeader subtitle="Stock et réceptions" />

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="warehousedash-startDate" className="mb-1 block text-xs font-medium text-gray-600">
              Période — du
            </label>
            <Input
              id="warehousedash-startDate"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="warehousedash-endDate" className="mb-1 block text-xs font-medium text-gray-600">
              au
            </label>
            <Input
              id="warehousedash-endDate"
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StatTile
            label="Rotation des stocks"
            value={formatRatio(rotation?.rotationStockJours, " j")}
            loading={rotationLoading}
            delta={computeDelta(
              rotation?.rotationStockJours,
              priorRotation?.rotationStockJours,
              (diff) => `${Math.round(diff)} j`,
            )}
            href="/stock"
          />
          <StatTile
            label="Valeur du stock"
            value={formatFcfa(rotation?.stockValue)}
            loading={rotationLoading}
            delta={computeDelta(rotation?.stockValue, priorRotation?.stockValue, formatFcfa)}
            href="/stock"
          />
        </div>
      </div>

      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-600">
          Position actuelle
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatTile
            label="Produits en stock bas"
            value={formatRatio(lowStockCount, "")}
            loading={alertsLoading}
            status={lowStockStatus}
            href="/products"
          />
          <StatTile
            label="Réceptions en attente"
            value={formatRatio(stats?.pendingPurchasesCount, "")}
            loading={statsLoading}
            href={canSeeAchats ? "/purchases" : undefined}
          />
          <StatTile
            label="Mouvements aujourd'hui"
            value={formatRatio(stats?.movementsTodayCount, "")}
            loading={statsLoading}
            href="/stock"
          />
        </div>
      </div>

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
  );
}
