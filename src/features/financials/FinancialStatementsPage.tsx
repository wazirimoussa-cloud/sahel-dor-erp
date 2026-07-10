import { useState } from "react";
import { useAuth } from "@/auth/useAuth";
import { useFinancialStatements } from "@/features/financials/useFinancialStatements";
import { useUpdateCapitalSocial } from "@/features/financials/useUpdateCapitalSocial";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

function formatFCFA(value: number) {
  return `${Math.round(value).toLocaleString("fr-FR")} FCFA`;
}

function formatRatio(value: number | null, suffix: string) {
  return value === null
    ? "—"
    : `${value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}${suffix}`;
}

function defaultStartDate() {
  return `${new Date().getFullYear()}-01-01`;
}

function defaultEndDate() {
  return new Date().toISOString().slice(0, 10);
}

export function FinancialStatementsPage() {
  const { profile } = useAuth();
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const { data, isLoading, error } = useFinancialStatements(startDate, endDate);
  const updateCapital = useUpdateCapitalSocial();
  const [capitalInput, setCapitalInput] = useState<string | null>(null);
  const canEditCapital = profile?.role === "accounting";

  const displayedCapital = capitalInput ?? (data ? String(data.capitalSocial) : "");

  async function handleSaveCapital() {
    if (!profile?.companyId) return;
    const value = Number(displayedCapital);
    if (Number.isNaN(value) || value < 0) return;
    await updateCapital.mutateAsync({ companyId: profile.companyId, capitalSocial: value });
    setCapitalInput(null);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-800">États financiers</h1>
        <p className="mt-1 text-sm text-gray-500">
          Bilan et compte de résultat SYSCOHADA simplifiés, calculés automatiquement à partir du
          journal comptable et des mouvements de stock. Ne couvre que les comptes déjà alimentés par
          les flux achats/ventes/trésorerie ; aucune immobilisation n'est suivie (voir README).
        </p>
      </div>

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Compte de résultat — du
            </label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">au</label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <p className="pb-2 text-xs text-gray-400">
            Le bilan est toujours une photo cumulée à la date de fin choisie.
          </p>
        </div>
      </Card>

      {isLoading && <p className="text-sm text-gray-500">Chargement…</p>}
      {error && (
        <p className="text-sm text-red-600">Impossible de calculer les états financiers.</p>
      )}

      {data && (
        <>
          <Card>
            <h2 className="mb-3 text-base font-semibold text-gray-800">Compte de résultat</h2>
            <table className="w-full text-left text-sm">
              <tbody>
                <tr className="border-b border-gray-100">
                  <td className="py-2">Produits (ventes)</td>
                  <td className="py-2 text-right">{formatFCFA(data.incomeStatement.produits)}</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2">Achats de marchandises</td>
                  <td className="py-2 text-right">− {formatFCFA(data.incomeStatement.charges)}</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2">
                    Variation de stocks
                    <span className="ml-1 text-xs text-gray-400">
                      (stock fin − stock début de période, achats uniquement)
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    {data.incomeStatement.variationStock >= 0 ? "+ " : "− "}
                    {formatFCFA(Math.abs(data.incomeStatement.variationStock))}
                  </td>
                </tr>
                <tr className="font-semibold">
                  <td className="py-2">Résultat net</td>
                  <td className="py-2 text-right">
                    {formatFCFA(data.incomeStatement.resultatNet)}
                  </td>
                </tr>
              </tbody>
            </table>
          </Card>

          <Card>
            <h2 className="mb-3 text-base font-semibold text-gray-800">
              Bilan au {new Date(endDate).toLocaleDateString("fr-FR")}
            </h2>
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="mb-2 text-sm font-medium text-gray-600">Actif</h3>
                <table className="w-full text-left text-sm">
                  <tbody>
                    <tr className="border-b border-gray-100">
                      <td className="py-2">Stock valorisé</td>
                      <td className="py-2 text-right">
                        {formatFCFA(data.balanceSheet.actif.stock)}
                      </td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="py-2">Clients</td>
                      <td className="py-2 text-right">
                        {formatFCFA(data.balanceSheet.actif.clients)}
                      </td>
                    </tr>
                    {data.balanceSheet.actif.tvaCreance > 0 && (
                      <tr className="border-b border-gray-100">
                        <td className="py-2">État, TVA à récupérer</td>
                        <td className="py-2 text-right">
                          {formatFCFA(data.balanceSheet.actif.tvaCreance)}
                        </td>
                      </tr>
                    )}
                    <tr className="border-b border-gray-100">
                      <td className="py-2">Trésorerie</td>
                      <td className="py-2 text-right">
                        {formatFCFA(data.balanceSheet.actif.tresorerie)}
                      </td>
                    </tr>
                    <tr className="font-semibold">
                      <td className="py-2">Total Actif</td>
                      <td className="py-2 text-right">
                        {formatFCFA(data.balanceSheet.totalActif)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div>
                <h3 className="mb-2 text-sm font-medium text-gray-600">Passif</h3>
                <table className="w-full text-left text-sm">
                  <tbody>
                    <tr className="border-b border-gray-100">
                      <td className="py-2">Fournisseurs</td>
                      <td className="py-2 text-right">
                        {formatFCFA(data.balanceSheet.passif.fournisseurs)}
                      </td>
                    </tr>
                    {data.balanceSheet.passif.tvaAPayer > 0 && (
                      <tr className="border-b border-gray-100">
                        <td className="py-2">État, TVA à payer</td>
                        <td className="py-2 text-right">
                          {formatFCFA(data.balanceSheet.passif.tvaAPayer)}
                        </td>
                      </tr>
                    )}
                    <tr className="border-b border-gray-100">
                      <td className="py-2 align-top">
                        Capital social
                        {canEditCapital && (
                          <div className="mt-1 flex items-center gap-2">
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              className="w-32"
                              value={displayedCapital}
                              onChange={(e) => setCapitalInput(e.target.value)}
                            />
                            <Button
                              type="button"
                              variant="secondary"
                              className="px-2 py-1 text-xs"
                              disabled={updateCapital.isPending}
                              onClick={handleSaveCapital}
                            >
                              Enregistrer
                            </Button>
                          </div>
                        )}
                      </td>
                      <td className="py-2 text-right align-top">
                        {formatFCFA(data.balanceSheet.passif.capitalSocial)}
                      </td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="py-2">Résultat cumulé</td>
                      <td className="py-2 text-right">
                        {formatFCFA(data.balanceSheet.passif.resultatCumule)}
                      </td>
                    </tr>
                    <tr className="font-semibold">
                      <td className="py-2">Total Passif</td>
                      <td className="py-2 text-right">
                        {formatFCFA(data.balanceSheet.totalPassif)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {data.unvaluedStock.length > 0 && (
              <div className="mt-4 rounded-md bg-amber-50 p-3 text-xs text-amber-700">
                Stock non valorisé (issu uniquement de production/transformation, jamais acheté —
                non inclus dans le total Actif) :{" "}
                {data.unvaluedStock.map((s) => `${s.name} (${s.quantity})`).join(", ")}
              </div>
            )}
          </Card>

          <Card>
            <h2 className="mb-3 text-base font-semibold text-gray-800">Analyse financière</h2>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <dt className="text-xs text-gray-500">Résultat net (période)</dt>
                <dd className="text-lg font-semibold text-gray-800">
                  {formatFCFA(data.ratios.resultatNetPeriode)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Marge commerciale</dt>
                <dd className="text-lg font-semibold text-gray-800">
                  {formatRatio(data.ratios.margeCommerciale, "%")}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Autonomie financière</dt>
                <dd className="text-lg font-semibold text-gray-800">
                  {formatRatio(data.ratios.autonomieFinanciere, "%")}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Liquidité générale</dt>
                <dd className="text-lg font-semibold text-gray-800">
                  {formatRatio(data.ratios.liquiditeGenerale, "")}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Délai moyen de règlement clients</dt>
                <dd className="text-lg font-semibold text-gray-800">
                  {formatRatio(data.ratios.delaiReglementClients, " j")}
                </dd>
              </div>
            </dl>
          </Card>
        </>
      )}
    </div>
  );
}
