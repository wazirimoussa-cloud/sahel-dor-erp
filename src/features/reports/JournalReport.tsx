import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAllJournalEntries } from "@/features/accounting/useJournalEntries";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ReportDateRangeFilter } from "@/components/reports/ReportDateRangeFilter";
import { ReportExportButton } from "@/components/reports/ReportExportButton";
import { generateJournalPdf } from "@/lib/pdf";
import { formatNumber } from "@/lib/format";
import { exportRowsToExcel } from "@/lib/xlsx";

const JOURNAL_LABELS: Record<string, string> = {
  ACHATS: "Achats",
  VENTES: "Ventes",
  TRESORERIE: "Trésorerie",
  BANQUE: "Banque",
  CAISSE: "Caisse",
};

type EntryLine = { id: string; debit: number; credit: number; chart_of_accounts: { code: string; name: string } | { code: string; name: string }[] | null };

// Réutilise fetchAllJournalEntries() (déjà présent dans useJournalEntries.ts, utilisé par
// l'export PDF de JournalPage.tsx) -- jeu de données complet, filtré ici côté client par
// période/journal. useJournalEntries() (paginée, opérationnelle) n'est pas modifiée.
export function JournalReport() {
  const { data: entries, isLoading, error } = useQuery({
    queryKey: ["reports", "journal_entries"],
    queryFn: fetchAllJournalEntries,
  });
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [journalCode, setJournalCode] = useState("");
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  function filteredEntries() {
    return (entries ?? []).filter((entry) => {
      if (dateFrom && entry.entry_date < `${dateFrom}T00:00:00.000`) return false;
      if (dateTo && entry.entry_date > `${dateTo}T23:59:59.999`) return false;
      if (journalCode && entry.journal_code !== journalCode) return false;
      return true;
    });
  }

  function accountLabelOf(line: EntryLine) {
    const account = line.chart_of_accounts;
    const a = Array.isArray(account) ? account[0] : account;
    return a ? `${a.code} — ${a.name}` : "—";
  }

  async function handleExportExcel() {
    const rows: Record<string, string | number>[] = [];
    for (const entry of filteredEntries()) {
      for (const line of entry.journal_entry_lines as EntryLine[]) {
        rows.push({
          date: new Date(entry.entry_date).toLocaleString("fr-FR"),
          journal: JOURNAL_LABELS[entry.journal_code] ?? entry.journal_code,
          description: entry.description,
          compte: accountLabelOf(line),
          debit: line.debit > 0 ? Math.round(line.debit) : "",
          credit: line.credit > 0 ? Math.round(line.credit) : "",
        });
      }
    }
    await exportRowsToExcel(
      `etat-journal-comptable-${new Date().toISOString().slice(0, 10)}.xlsx`,
      [
        { header: "Date", key: "date" },
        { header: "Journal", key: "journal" },
        { header: "Description", key: "description" },
        { header: "Compte", key: "compte" },
        { header: "Débit (FCFA)", key: "debit" },
        { header: "Crédit (FCFA)", key: "credit" },
      ],
      rows,
    );
  }

  async function handleExportPdf() {
    setIsExportingPdf(true);
    try {
      const pdfEntries = filteredEntries().map((entry) => {
        const lines = entry.journal_entry_lines as EntryLine[];
        return {
          id: entry.id,
          entryDate: entry.entry_date,
          journalCode: JOURNAL_LABELS[entry.journal_code] ?? entry.journal_code,
          description: entry.description,
          lines: lines.map((line) => ({
            accountLabel: accountLabelOf(line),
            debit: line.debit,
            credit: line.credit,
          })),
        };
      });
      const { doc, filename } = await generateJournalPdf(pdfEntries);
      doc.save(filename);
    } finally {
      setIsExportingPdf(false);
    }
  }

  const rowsToShow = filteredEntries();

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-800">Journal comptable</h2>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" disabled={isExportingPdf || rowsToShow.length === 0} onClick={() => void handleExportPdf()}>
            {isExportingPdf ? "Génération…" : "Exporter en PDF"}
          </Button>
          <ReportExportButton onExport={handleExportExcel} disabled={rowsToShow.length === 0} />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <ReportDateRangeFilter
          idPrefix="journal-report"
          startDate={dateFrom}
          endDate={dateTo}
          onStartDateChange={setDateFrom}
          onEndDateChange={setDateTo}
        />
        <div>
          <label htmlFor="journal-report-journalCode" className="mb-1 block text-xs font-medium text-gray-600">
            Journal
          </label>
          <select
            id="journal-report-journalCode"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            value={journalCode}
            onChange={(e) => setJournalCode(e.target.value)}
          >
            <option value="">Tous</option>
            {Object.entries(JOURNAL_LABELS).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading && <p className="text-sm text-gray-500">Chargement…</p>}
      {error && <p className="text-sm text-red-600">Impossible de charger le journal comptable.</p>}
      <div className="space-y-4">
        {rowsToShow.map((entry) => {
          const lines = entry.journal_entry_lines as EntryLine[];
          const totalDebit = lines.reduce((sum, line) => sum + line.debit, 0);
          return (
            <div key={entry.id} className="rounded-md border border-gray-100 p-3">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                    {JOURNAL_LABELS[entry.journal_code] ?? entry.journal_code}
                  </span>
                  <span className="ml-2 text-sm font-medium text-gray-800">{entry.description}</span>
                </div>
                <span className="text-xs text-gray-500">{new Date(entry.entry_date).toLocaleString("fr-FR")}</span>
              </div>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500">
                    <th scope="col" className="py-1">Compte</th>
                    <th scope="col" className="py-1">Débit</th>
                    <th scope="col" className="py-1">Crédit</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.id} className="border-b border-gray-100">
                      <td className="py-1">{accountLabelOf(line)}</td>
                      <td className="py-1">{line.debit > 0 ? formatNumber(line.debit) : ""}</td>
                      <td className="py-1">{line.credit > 0 ? formatNumber(line.credit) : ""}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="pt-1 text-right text-xs font-medium text-gray-500">Total</td>
                    <td className="pt-1 text-xs font-semibold text-gray-700">{formatNumber(totalDebit)} FCFA</td>
                    <td className="pt-1 text-xs font-semibold text-gray-700">{formatNumber(totalDebit)} FCFA</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          );
        })}
        {rowsToShow.length === 0 && !isLoading && (
          <p className="text-sm text-gray-500">Aucune écriture trouvée pour ces filtres.</p>
        )}
      </div>
    </Card>
  );
}
