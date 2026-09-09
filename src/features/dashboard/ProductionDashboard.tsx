import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { StatTile, type StatTileDelta, type StatTileStatus } from "@/components/ui/StatTile";
import { DashboardHeader } from "@/features/dashboard/DashboardHeader";
import { useLowStockProducts } from "@/features/dashboard/useLowStockProducts";
import { useProductionPeriodSummary } from "@/features/dashboard/useProductionPeriodSummary";
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
// StatTile porte ce jugement. Même helper que Finance/Ventes/Magasin/Achats (pas extrait,
// cohérent avec formatFcfa déjà dupliqué page par page dans cette app).
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

function warehouseName(w: { name: string } | { name: string }[] | null) {
  return Array.isArray(w) ? w[0]?.name : w?.name;
}

// Instantané "à l'instant présent" (comportement identique à avant) : les dernières
// productions/transformations, non bornées à la période choisie -- même logique que "Bons
// d'achat récents" sur les autres dashboards.
function useProductionSnapshot() {
  return useQuery({
    queryKey: ["dashboard-production-snapshot"],
    queryFn: async () => {
      const [recentProductions, recentTransformations] = await Promise.all([
        supabase
          .from("productions")
          .select("id, created_at, warehouses(name)")
          .order("created_at", { ascending: false })
          .limit(4),
        supabase
          .from("transformations")
          .select("id, created_at, warehouses(name)")
          .order("created_at", { ascending: false })
          .limit(4),
      ]);

      return {
        recentProductions: recentProductions.data ?? [],
        recentTransformations: recentTransformations.data ?? [],
      };
    },
  });
}

// Responsable de production : activité de production/transformation sur la période, et les
// matières premières en stock bas (bloquantes pour produire) -- pas de vision financière.
// Le dashboard est visible via hasModuleAccess("production") || hasModuleAccess("transformation")
// (condition OU entre deux modules distincts) : contrairement à Achats (module unique), les
// liens et cartes de chaque famille doivent être gardés individuellement -- y compris ligne
// par ligne dans les listes "Dernières productions"/"Dernières transformations", puisqu'un
// profil peut n'avoir accès qu'à l'une des deux. Les données elles-mêmes restent toujours
// affichées (la RLS n'est scopée qu'au niveau company_id, jamais par attribution -- même
// convention que "Réceptions en attente" sur Magasin, visible même sans le module achats) ;
// seule la navigation est gardée.
export function ProductionDashboard() {
  const { hasModuleAccess } = useAuth();
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const prior = priorPeriod(startDate, endDate);

  const { data: snapshot, isLoading: snapshotLoading } = useProductionSnapshot();
  const { data: summary, isLoading: summaryLoading } = useProductionPeriodSummary(startDate, endDate);
  const { data: priorSummary } = useProductionPeriodSummary(prior.startDate, prior.endDate);
  const { data: lowStockProducts, isLoading: alertsLoading } = useLowStockProducts();

  const canSeeProduction = hasModuleAccess("production");
  const canSeeTransformation = hasModuleAccess("transformation");
  const lowStockCount = lowStockProducts?.length ?? 0;
  const lowStockStatus: StatTileStatus | undefined =
    lowStockProducts === undefined ? undefined : lowStockCount > 0 ? "critical" : "ok";

  return (
    <div className="space-y-6">
      <DashboardHeader subtitle="Production et transformation" />

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="productiondash-startDate" className="mb-1 block text-xs font-medium text-gray-600">
              Période — du
            </label>
            <Input
              id="productiondash-startDate"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="productiondash-endDate" className="mb-1 block text-xs font-medium text-gray-600">
              au
            </label>
            <Input
              id="productiondash-endDate"
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
            label="Productions"
            value={formatRatio(summary?.productionsCount, "")}
            loading={summaryLoading}
            delta={computeDelta(
              summary?.productionsCount,
              priorSummary?.productionsCount,
              (diff) => `${Math.round(diff)}`,
            )}
            href={canSeeProduction ? "/productions" : undefined}
          />
          <StatTile
            label="Valeur produite (productions)"
            value={formatFcfa(summary?.productionsValue)}
            loading={summaryLoading}
            delta={computeDelta(summary?.productionsValue, priorSummary?.productionsValue, formatFcfa)}
            href={canSeeProduction ? "/productions" : undefined}
          />
          <StatTile
            label="Transformations"
            value={formatRatio(summary?.transformationsCount, "")}
            loading={summaryLoading}
            delta={computeDelta(
              summary?.transformationsCount,
              priorSummary?.transformationsCount,
              (diff) => `${Math.round(diff)}`,
            )}
            href={canSeeTransformation ? "/transformations" : undefined}
          />
          <StatTile
            label="Valeur produite (transformations)"
            value={formatFcfa(summary?.transformationsValue)}
            loading={summaryLoading}
            delta={computeDelta(
              summary?.transformationsValue,
              priorSummary?.transformationsValue,
              formatFcfa,
            )}
            href={canSeeTransformation ? "/transformations" : undefined}
          />
        </div>
      </div>

      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-600">
          Position actuelle
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatTile
            label="Produits en stock bas"
            value={formatRatio(lowStockCount, "")}
            loading={alertsLoading}
            status={lowStockStatus}
            href="/products"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-600">
            Dernières productions
          </p>
          {snapshotLoading ? (
            <p className="text-sm text-gray-500">Chargement…</p>
          ) : snapshot && snapshot.recentProductions.length > 0 ? (
            <ul className="space-y-2 text-sm text-gray-700">
              {snapshot.recentProductions.map((p) => (
                <li key={p.id} className="flex items-center justify-between border-b border-gray-100 pb-1">
                  <div>
                    <span>{warehouseName(p.warehouses) ?? "—"}</span>
                    <span className="ml-2 text-xs text-gray-500">
                      {new Date(p.created_at).toLocaleDateString("fr-FR")}
                    </span>
                  </div>
                  {canSeeProduction ? (
                    <Link to={`/productions/${p.id}`} className="text-brand-600 hover:underline">
                      Voir
                    </Link>
                  ) : (
                    <span className="text-xs text-gray-400">Voir</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">Aucune production pour le moment.</p>
          )}
        </Card>

        <Card>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-600">
            Dernières transformations
          </p>
          {snapshotLoading ? (
            <p className="text-sm text-gray-500">Chargement…</p>
          ) : snapshot && snapshot.recentTransformations.length > 0 ? (
            <ul className="space-y-2 text-sm text-gray-700">
              {snapshot.recentTransformations.map((t) => (
                <li key={t.id} className="flex items-center justify-between border-b border-gray-100 pb-1">
                  <div>
                    <span>{warehouseName(t.warehouses) ?? "—"}</span>
                    <span className="ml-2 text-xs text-gray-500">
                      {new Date(t.created_at).toLocaleDateString("fr-FR")}
                    </span>
                  </div>
                  {canSeeTransformation ? (
                    <Link to={`/transformations/${t.id}`} className="text-brand-600 hover:underline">
                      Voir
                    </Link>
                  ) : (
                    <span className="text-xs text-gray-400">Voir</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">Aucune transformation pour le moment.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
