import { describe, expect, it } from "vitest";
import { computeVatDeclaration, type JournalEntryForVat } from "@/features/financials/useVatDeclaration";

function journalLine(code: string, debit: number, credit: number) {
  return { debit, credit, chart_of_accounts: { code } };
}

describe("computeVatDeclaration", () => {
  it("calcule une TVA nette à payer (collectée > déductible)", () => {
    const entries: JournalEntryForVat[] = [
      {
        journal_entry_lines: [
          journalLine("411", 30_000, 0),
          journalLine("701", 0, 27_000),
          journalLine("4431", 0, 3_000),
        ],
      },
      {
        journal_entry_lines: [
          journalLine("601", 10_000, 0),
          journalLine("4452", 1_800, 0),
          journalLine("401", 0, 11_800),
        ],
      },
    ];

    const result = computeVatDeclaration(entries, 18);

    expect(result.vatRate).toBe(18);
    expect(result.chiffreAffairesHT).toBe(27_000);
    expect(result.achatsHT).toBe(10_000);
    expect(result.tvaCollectee).toBe(3_000);
    expect(result.tvaDeductible).toBe(1_800);
    expect(result.tvaNette).toBe(1_200);
  });

  it("un crédit de TVA à reporter (déductible > collectée) reste négatif, sans clamp", () => {
    const entries: JournalEntryForVat[] = [
      {
        journal_entry_lines: [journalLine("4431", 0, 500), journalLine("4452", 2_000, 0)],
      },
    ];

    const result = computeVatDeclaration(entries, 18);

    expect(result.tvaCollectee).toBe(500);
    expect(result.tvaDeductible).toBe(2_000);
    expect(result.tvaNette).toBe(-1_500);
  });

  it("aucune écriture sur la période renvoie des totaux nuls", () => {
    const result = computeVatDeclaration([], 18);

    expect(result.chiffreAffairesHT).toBe(0);
    expect(result.achatsHT).toBe(0);
    expect(result.tvaCollectee).toBe(0);
    expect(result.tvaDeductible).toBe(0);
    expect(result.tvaNette).toBe(0);
  });

  it("ignore les comptes hors périmètre (701/601/4431/4452)", () => {
    const entries: JournalEntryForVat[] = [
      {
        journal_entry_lines: [
          journalLine("521", 100_000, 0), // trésorerie, hors périmètre TVA
          journalLine("411", 0, 100_000),
          journalLine("701", 0, 5_000),
        ],
      },
    ];

    const result = computeVatDeclaration(entries, 18);

    expect(result.chiffreAffairesHT).toBe(5_000);
    expect(result.tvaCollectee).toBe(0);
    expect(result.tvaDeductible).toBe(0);
  });
});
