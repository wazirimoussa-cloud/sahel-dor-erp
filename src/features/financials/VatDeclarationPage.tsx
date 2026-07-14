import { useState } from "react";
import { useVatDeclaration } from "@/features/financials/useVatDeclaration";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { generateVatDeclarationPdf } from "@/lib/pdf";

function formatFCFA(value: number) {
  return `${Math.round(value).toLocaleString("fr-FR")} FCFA`;
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function monthBounds(month: string) {
  const [year, monthNum] = month.split("-").map(Number);
  const startDate = `${month}-01`;
  const lastDay = new Date(year, monthNum, 0).getDate();
  const endDate = `${month}-${String(lastDay).padStart(2, "0")}`;
  return { startDate, endDate };
}

function monthLabel(month: string) {
  const [year, monthNum] = month.split("-").map(Number);
  return new Date(year, monthNum - 1, 1).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });
}

export function VatDeclarationPage() {
  const [month, setMonth] = useState(currentMonth);
  const { startDate, endDate } = monthBounds(month);
  const { data, isLoading, error } = useVatDeclaration(startDate, endDate);

  async function handleExportPdf() {
    if (!data) return;
    const { doc, filename } = await generateVatDeclarationPdf({
      periodLabel: monthLabel(month),
      vatRate: data.vatRate,
      chiffreAffairesHT: data.chiffreAffairesHT,
      tvaCollectee: data.tvaCollectee,
      achatsHT: data.achatsHT,
      tvaDeductible: data.tvaDeductible,
      tvaNette: data.tvaNette,
    });
    doc.save(filename);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-forest-900">Déclaration TVA</h1>
          <p className="mt-1 text-sm text-gray-500">
            TVA collectée sur les ventes moins TVA déductible sur les achats, pour le mois choisi —
            calculée à partir du journal comptable (voir États financiers).
          </p>
        </div>
        {data && (
          <Button variant="secondary" onClick={() => void handleExportPdf()}>
            Exporter en PDF
          </Button>
        )}
      </div>

      <Card>
        <label className="mb-1 block text-xs font-medium text-gray-600">Mois</label>
        <input
          type="month"
          className="rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
      </Card>

      {isLoading && <p className="text-sm text-gray-500">Chargement…</p>}
      {error && <p className="text-sm text-red-600">Impossible de calculer la déclaration TVA.</p>}

      {data && (
        <Card>
          <h2 className="mb-3 text-base font-semibold text-gray-800">
            {monthLabel(month)} — Taux applicable : {data.vatRate}%
          </h2>
          <table className="w-full text-left text-sm">
            <tbody>
              <tr className="border-b border-gray-100">
                <td className="py-2">Chiffre d'affaires HT (ventes)</td>
                <td className="py-2 text-right">{formatFCFA(data.chiffreAffairesHT)}</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2">TVA collectée</td>
                <td className="py-2 text-right">{formatFCFA(data.tvaCollectee)}</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2">Achats HT</td>
                <td className="py-2 text-right">{formatFCFA(data.achatsHT)}</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2">TVA déductible</td>
                <td className="py-2 text-right">{formatFCFA(data.tvaDeductible)}</td>
              </tr>
              <tr className="font-semibold">
                <td className="py-2">
                  {data.tvaNette >= 0 ? "TVA nette à payer" : "Crédit de TVA à reporter"}
                </td>
                <td className="py-2 text-right">{formatFCFA(Math.abs(data.tvaNette))}</td>
              </tr>
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
