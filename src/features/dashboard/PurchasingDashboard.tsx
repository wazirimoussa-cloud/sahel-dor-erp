import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { StatTile, type StatTileDelta } from "@/components/ui/StatTile";
import { DashboardHeader } from "@/features/dashboard/DashboardHeader";
import { usePurchasingPeriodSummary } from "@/features/dashboard/usePurchasingPeriodSummary";
import { PURCHASE_STATUS_LABELS, PURCHASE_STATUS_CLASSES } from "@/lib/purchaseDisplay";
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
// StatTile porte ce jugement. Même helper que Finance/Ventes/Magasin (pas extrait, cohérent
// avec formatFcfa déjà dupliqué page par page dans cette app).
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

// Instantané "à l'instant présent" (comportement identique à avant) : en attente de
// réception, fournisseurs, bons d'achat récents.
function usePurchasingSnapshot() {
  return useQuery({
    queryKey: ["dashboard-purchasing-snapshot"],
    queryFn: async () => {
      const [pendingPurchases, suppliers, recentPurchases] = await Promise.all([
        supabase.from("purchases").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("suppliers").select("id", { count: "exact", head: true }),
        supabase
          .from("purchases")
          .select("id, status, created_at, suppliers(name)")
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      return {
        pendingCount: pendingPurchases.count ?? 0,
        suppliersCount: suppliers.count ?? 0,
        recentPurchases: recentPurchases.data ?? [],
      };
    },
  });
}

// Responsable des achats : ce qu'il a créé/reçu et ce qui attend d'être réceptionné par le
// magasin — pas de vision financière ni de stock (hors de son périmètre RBAC). Le dashboard
// n'est visible que via hasModuleAccess("achats") (condition unique, DashboardPage.tsx),
// donc tous les liens vers /purchases sont toujours cliquables ici ; seuls /suppliers (module
// "fournisseurs", distinct) doivent être gardés individuellement.
export function PurchasingDashboard() {
  const { hasModuleAccess } = useAuth();
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const prior = priorPeriod(startDate, endDate);

  const { data: snapshot, isLoading: snapshotLoading } = usePurchasingSnapshot();
  const { data: summary, isLoading: summaryLoading } = usePurchasingPeriodSummary(startDate, endDate);
  const { data: priorSummary } = usePurchasingPeriodSummary(prior.startDate, prior.endDate);

  const canSeeSuppliers = hasModuleAccess("fournisseurs");

  return (
    <div className="space-y-6">
      <DashboardHeader subtitle="Bons d'achat et fournisseurs" />

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="purchasingdash-startDate" className="mb-1 block text-xs font-medium text-gray-600">
              Période — du
            </label>
            <Input
              id="purchasingdash-startDate"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="purchasingdash-endDate" className="mb-1 block text-xs font-medium text-gray-600">
              au
            </label>
            <Input
              id="purchasingdash-endDate"
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
            label="Montant total engagé (HT)"
            value={formatFcfa(summary?.totalHT)}
            loading={summaryLoading}
            delta={computeDelta(summary?.totalHT, priorSummary?.totalHT, formatFcfa)}
            href="/purchases"
          />
          <StatTile
            label="Achat moyen"
            value={formatFcfa(summary?.averagePurchase)}
            loading={summaryLoading}
            delta={computeDelta(summary?.averagePurchase, priorSummary?.averagePurchase, formatFcfa)}
            href="/purchases"
          />
          <StatTile
            label="Bons d'achat reçus"
            value={formatRatio(summary?.purchaseCount, "")}
            loading={summaryLoading}
            delta={computeDelta(
              summary?.purchaseCount,
              priorSummary?.purchaseCount,
              (diff) => `${Math.round(diff)}`,
            )}
            href="/purchases"
          />
        </div>
      </div>

      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-600">
          Position actuelle
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StatTile
            label="Bons d'achat en attente de réception"
            value={formatRatio(snapshot?.pendingCount, "")}
            loading={snapshotLoading}
            href="/purchases"
          />
          <StatTile
            label="Fournisseurs"
            value={formatRatio(snapshot?.suppliersCount, "")}
            loading={snapshotLoading}
            href={canSeeSuppliers ? "/suppliers" : undefined}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-600">
            Bons d'achat récents
          </p>
          {snapshotLoading ? (
            <p className="text-sm text-gray-500">Chargement…</p>
          ) : snapshot && snapshot.recentPurchases.length > 0 ? (
            <ul className="space-y-2 text-sm text-gray-700">
              {snapshot.recentPurchases.map((p) => {
                const supplier = p.suppliers as { name: string } | { name: string }[] | null;
                const supplierName = Array.isArray(supplier) ? supplier[0]?.name : supplier?.name;
                return (
                  <li key={p.id} className="flex items-center justify-between border-b border-gray-100 pb-1">
                    <div>
                      <span>{supplierName ?? "—"}</span>
                      <span className="ml-2 text-xs text-gray-500">
                        {new Date(p.created_at).toLocaleDateString("fr-FR")}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${PURCHASE_STATUS_CLASSES[p.status] ?? ""}`}
                      >
                        {PURCHASE_STATUS_LABELS[p.status] ?? p.status}
                      </span>
                      <Link to={`/purchases/${p.id}`} className="text-brand-600 hover:underline">
                        Voir
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">Aucun bon d'achat pour le moment.</p>
          )}
        </Card>

        <Card>
          {canSeeSuppliers ? (
            <Link
              to="/suppliers"
              className="mb-3 block text-xs font-semibold uppercase tracking-wide text-brand-600 hover:underline"
            >
              Top fournisseurs (période) →
            </Link>
          ) : (
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-600">
              Top fournisseurs (période)
            </p>
          )}
          {summaryLoading ? (
            <p className="text-sm text-gray-500">Chargement…</p>
          ) : summary && summary.topSuppliers.length > 0 ? (
            <ul className="space-y-2 text-sm text-gray-700">
              {summary.topSuppliers.map((s) => (
                <li key={s.supplierId} className="flex justify-between border-b border-gray-100 pb-1">
                  <span>{s.name}</span>
                  <span className="font-medium text-gray-800">{formatFcfa(s.total)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">Aucun bon d'achat reçu sur cette période.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
