import { describe, expect, it } from "vitest";
import {
  computeFinancialStatements,
  type ComputeFinancialStatementsInput,
} from "@/features/financials/useFinancialStatements";
import type { FixedAssetRow } from "@/features/financials/useFixedAssets";

// computeFinancialStatements est la seule logique de calcul financier de l'app jamais
// exercée par un test : les tests d'intégration existants (tests/integration/*.ts)
// vérifient les écritures comptables générées par les RPC, pas cette agrégation JS
// côté frontend (bilan, compte de résultat, ratios) qui les consomme ensuite. Un bug
// ici produirait un bilan faux sans qu'aucun test ne le détecte.

function journalLine(code: string, debit: number, credit: number) {
  return { debit, credit, chart_of_accounts: { code } };
}

function baseInput(overrides: Partial<ComputeFinancialStatementsInput> = {}): ComputeFinancialStatementsInput {
  return {
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    products: [],
    purchaseLots: [],
    transactions: [],
    journalEntries: [],
    capitalSocial: 0,
    fixedAssets: [],
    ...overrides,
  };
}

describe("computeFinancialStatements", () => {
  it("calcule un bilan équilibré avec vente, achat et cession en plus-value", () => {
    const linearAsset: FixedAssetRow = {
      id: "asset-1",
      name: "Camion",
      category: "Véhicule",
      acquisition_date: "2025-01-15",
      acquisition_cost: 1_200_000,
      useful_life_years: 5,
      disposal_date: null,
      depreciation_method: "lineaire",
      degressif_coefficient: null,
    };

    const result = computeFinancialStatements(
      baseInput({
        capitalSocial: 1_000_000,
        fixedAssets: [linearAsset],
        products: [{ id: "p1", name: "Riz", unit: "sac" }],
        purchaseLots: [{ product_id: "p1", quantity_received: 100, unit_cost: 500 }],
        transactions: [
          { product_id: "p1", type: "IN", quantity: 100, created_at: "2025-06-01T00:00:00.000" },
          { product_id: "p1", type: "OUT", quantity: 30, created_at: "2026-01-10T00:00:00.000" },
        ],
        journalEntries: [
          {
            // Vente 27 000 HT + 3 000 TVA, à crédit (411).
            entry_date: "2026-01-10T00:00:00.000",
            journal_entry_lines: [
              journalLine("411", 30_000, 0),
              journalLine("701", 0, 27_000),
              journalLine("4431", 0, 3_000),
            ],
          },
          {
            // Achat 10 000 HT + 1 800 TVA (18%), à crédit (401).
            entry_date: "2026-01-05T00:00:00.000",
            journal_entry_lines: [
              journalLine("601", 10_000, 0),
              journalLine("4452", 1_800, 0),
              journalLine("401", 0, 11_800),
            ],
          },
          {
            // Cession d'un autre actif : VNC 100 000, prix de cession 150 000 (plus-value 50 000).
            entry_date: "2026-01-20T00:00:00.000",
            journal_entry_lines: [
              journalLine("675", 100_000, 0),
              journalLine("521", 150_000, 0),
              journalLine("775", 0, 150_000),
            ],
          },
        ],
      }),
    );

    // Compte de résultat.
    expect(result.incomeStatement.produits).toBe(27_000);
    expect(result.incomeStatement.charges).toBe(10_000);
    expect(result.incomeStatement.variationStock).toBe(-15_000); // 70×500 − 100×500
    expect(result.incomeStatement.dotationsAmortissements).toBe(20_000); // 1 mois à 20 000/mois
    expect(result.incomeStatement.resultatCessionImmobilisations).toBe(50_000);
    expect(result.incomeStatement.resultatNet).toBe(32_000); // 27000-10000-15000-20000+50000

    // Bilan.
    expect(result.balanceSheet.actif.immobilisationsNettes).toBe(960_000); // 1200000 - 12 mois amorti
    expect(result.balanceSheet.actif.stock).toBe(35_000);
    expect(result.balanceSheet.actif.clients).toBe(30_000);
    expect(result.balanceSheet.actif.tvaCreance).toBe(0);
    expect(result.balanceSheet.actif.tresorerie).toBe(150_000);
    expect(result.balanceSheet.totalActif).toBe(1_175_000);

    expect(result.balanceSheet.passif.fournisseurs).toBe(11_800);
    expect(result.balanceSheet.passif.tvaAPayer).toBe(1_200);
    expect(result.balanceSheet.passif.capitalSocial).toBe(1_000_000);
    expect(result.balanceSheet.passif.resultatCumule).toBe(162_000);

    // Le bilan doit toujours s'équilibrer par construction (résidu = résultat cumulé).
    expect(result.balanceSheet.totalPassif).toBe(result.balanceSheet.totalActif);

    // Ratios.
    expect(result.ratios.margeCommerciale).toBeCloseTo((32_000 / 27_000) * 100, 6);
    expect(result.ratios.autonomieFinanciere).toBeCloseTo((1_162_000 / 1_175_000) * 100, 6);
    expect(result.ratios.liquiditeGenerale).toBeCloseTo(215_000 / 13_000, 6);
    expect(result.ratios.delaiReglementClients).toBeCloseTo((30_000 / 27_000) * 31, 6);

    expect(result.unvaluedStock).toHaveLength(0);
  });

  it("une moins-value de cession (prix < VNC) réduit le résultat sans être plafonnée", () => {
    const result = computeFinancialStatements(
      baseInput({
        journalEntries: [
          {
            entry_date: "2026-01-15T00:00:00.000",
            journal_entry_lines: [
              journalLine("675", 100_000, 0), // VNC sortie
              journalLine("521", 40_000, 0), // encaissement
              journalLine("775", 0, 40_000), // produit de cession
            ],
          },
        ],
      }),
    );

    expect(result.incomeStatement.resultatCessionImmobilisations).toBe(-60_000);
    expect(result.incomeStatement.resultatNet).toBe(-60_000);
  });

  it("un produit avec du stock mais sans lot d'achat connu apparaît en stock non valorisé", () => {
    const result = computeFinancialStatements(
      baseInput({
        products: [{ id: "p2", name: "Sous-produit fabriqué", unit: "kg" }],
        transactions: [
          { product_id: "p2", type: "IN", quantity: 50, created_at: "2026-01-05T00:00:00.000" },
        ],
        // Aucun purchaseLots pour p2 : jamais acheté, donc pas de CUMP connu.
      }),
    );

    expect(result.balanceSheet.actif.stock).toBe(0);
    expect(result.unvaluedStock).toEqual([
      { productId: "p2", name: "Sous-produit fabriqué", quantity: 50, unit: "kg" },
    ]);
  });

  it("une société sans aucune activité renvoie des totaux nuls et des ratios null (pas de division par zéro)", () => {
    const result = computeFinancialStatements(baseInput());

    expect(result.incomeStatement.produits).toBe(0);
    expect(result.balanceSheet.totalActif).toBe(0);
    expect(result.balanceSheet.totalPassif).toBe(0);
    expect(result.ratios.margeCommerciale).toBeNull();
    expect(result.ratios.autonomieFinanciere).toBeNull();
    expect(result.ratios.liquiditeGenerale).toBeNull();
    expect(result.ratios.delaiReglementClients).toBeNull();
  });
});
