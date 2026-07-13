import { useJournalEntries } from "@/features/accounting/useJournalEntries";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { generateJournalPdf } from "@/lib/pdf";

const JOURNAL_LABELS: Record<string, string> = {
  ACHATS: "Achats",
  VENTES: "Ventes",
  TRESORERIE: "Trésorerie", // ancien libellé, conservé pour les écritures antérieures à la Phase 16
  BANQUE: "Banque",
  CAISSE: "Caisse",
};

export function JournalPage() {
  const { data: entries, isLoading, error } = useJournalEntries();

  async function handleExportPdf() {
    if (!entries) return;
    const pdfEntries = entries.map((entry) => {
      const lines = entry.journal_entry_lines as {
        id: string;
        debit: number;
        credit: number;
        chart_of_accounts: { code: string; name: string } | { code: string; name: string }[] | null;
      }[];
      return {
        id: entry.id,
        entryDate: entry.entry_date,
        journalCode: JOURNAL_LABELS[entry.journal_code] ?? entry.journal_code,
        description: entry.description,
        lines: lines.map((line) => {
          const account = line.chart_of_accounts;
          const accountLabel = Array.isArray(account)
            ? account[0] && `${account[0].code} — ${account[0].name}`
            : account && `${account.code} — ${account.name}`;
          return { accountLabel: accountLabel ?? "—", debit: line.debit, credit: line.credit };
        }),
      };
    });
    const { doc, filename } = await generateJournalPdf(pdfEntries);
    doc.save(filename);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-800">Journal comptable</h1>
        {entries && entries.length > 0 && (
          <Button variant="secondary" onClick={() => void handleExportPdf()}>
            Exporter en PDF
          </Button>
        )}
      </div>
      <p className="text-sm text-gray-500">
        Alimenté automatiquement par les achats, ventes et paiements — aucune saisie
        manuelle possible dans cette version. Périmètre limité aux flux avec tiers
        externes et à la trésorerie (Production/Transformation non couvertes, voir
        README). À faire valider par un comptable avant tout usage officiel.
      </p>

      {isLoading && <p className="text-sm text-gray-500">Chargement…</p>}
      {error && <p className="text-sm text-red-600">Impossible de charger le journal comptable.</p>}

      {entries?.map((entry) => {
        const lines = entry.journal_entry_lines as {
          id: string;
          debit: number;
          credit: number;
          chart_of_accounts: { code: string; name: string } | { code: string; name: string }[] | null;
        }[];
        const totalDebit = lines.reduce((sum, line) => sum + line.debit, 0);

        return (
          <Card key={entry.id}>
            <div className="mb-2 flex items-center justify-between">
              <div>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                  {JOURNAL_LABELS[entry.journal_code] ?? entry.journal_code}
                </span>
                <span className="ml-2 text-sm font-medium text-gray-800">{entry.description}</span>
              </div>
              <span className="text-xs text-gray-500">
                {new Date(entry.entry_date).toLocaleString("fr-FR")}
              </span>
            </div>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  <th className="py-1">Compte</th>
                  <th className="py-1">Débit</th>
                  <th className="py-1">Crédit</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const account = line.chart_of_accounts;
                  const accountLabel = Array.isArray(account)
                    ? account[0] && `${account[0].code} — ${account[0].name}`
                    : account && `${account.code} — ${account.name}`;
                  return (
                    <tr key={line.id} className="border-b border-gray-100">
                      <td className="py-1">{accountLabel ?? "—"}</td>
                      <td className="py-1">{line.debit > 0 ? line.debit.toLocaleString("fr-FR") : ""}</td>
                      <td className="py-1">{line.credit > 0 ? line.credit.toLocaleString("fr-FR") : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td className="pt-1 text-right text-xs font-medium text-gray-500">Total</td>
                  <td className="pt-1 text-xs font-semibold text-gray-700">
                    {totalDebit.toLocaleString("fr-FR")} FCFA
                  </td>
                  <td className="pt-1 text-xs font-semibold text-gray-700">
                    {totalDebit.toLocaleString("fr-FR")} FCFA
                  </td>
                </tr>
              </tfoot>
            </table>
          </Card>
        );
      })}
      {entries?.length === 0 && <p className="text-sm text-gray-400">Aucune écriture pour le moment.</p>}
    </div>
  );
}
