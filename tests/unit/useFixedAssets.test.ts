import { describe, expect, it } from "vitest";
import { depreciationForPeriod, netBookValueAsOf, type FixedAssetRow } from "@/features/financials/useFixedAssets";

// netBookValueAsOf/depreciationForPeriod sont déjà exportées et pures, mais n'étaient
// jamais testées unitairement : seule la formule SQL équivalente (dispose_fixed_asset,
// 0066/0069) est vérifiée par les tests d'intégration. Cette réimplémentation JS,
// utilisée pour l'affichage (tableau des actifs, bilan), pourrait diverger de la SQL
// sans qu'aucun test ne le détecte.

function linearAsset(overrides: Partial<FixedAssetRow> = {}): FixedAssetRow {
  return {
    id: "asset-lin",
    name: "Camion",
    category: "Véhicule",
    acquisition_date: "2024-01-01",
    acquisition_cost: 1_200_000,
    useful_life_years: 5,
    disposal_date: null,
    depreciation_method: "lineaire",
    degressif_coefficient: null,
    ...overrides,
  };
}

function degressifAsset(overrides: Partial<FixedAssetRow> = {}): FixedAssetRow {
  return {
    id: "asset-deg",
    name: "Machine",
    category: "Équipement",
    acquisition_date: "2024-01-01",
    acquisition_cost: 1_000_000,
    useful_life_years: 4,
    disposal_date: null,
    depreciation_method: "degressif",
    degressif_coefficient: 2,
    ...overrides,
  };
}

describe("netBookValueAsOf — linéaire", () => {
  it("vaut 0 avant la date d'acquisition", () => {
    expect(netBookValueAsOf(linearAsset(), "2023-12-31")).toBe(0);
  });

  it("vaut le coût d'acquisition au jour même de l'acquisition", () => {
    expect(netBookValueAsOf(linearAsset(), "2024-01-01")).toBe(1_200_000);
  });

  it("décroît linéairement mois par mois (12 mois sur 60)", () => {
    expect(netBookValueAsOf(linearAsset(), "2025-01-01")).toBe(960_000); // 1200000 - 1200000×12/60
  });

  it("atteint 0 exactement à la fin de la durée d'utilité, sans jamais devenir négative au-delà", () => {
    expect(netBookValueAsOf(linearAsset(), "2029-01-01")).toBe(0); // 60 mois
    expect(netBookValueAsOf(linearAsset(), "2035-01-01")).toBe(0); // largement au-delà
  });

  it("est figée à 0 à partir de la date de cession, même si l'actif n'était pas amorti", () => {
    const asset = linearAsset({ disposal_date: "2024-07-01" });
    expect(netBookValueAsOf(asset, "2024-07-01")).toBe(0);
    expect(netBookValueAsOf(asset, "2030-01-01")).toBe(0);
  });

  it("reste calculée normalement juste avant la cession", () => {
    const asset = linearAsset({ disposal_date: "2024-07-01" });
    // 5 mois écoulés (janvier à juin) : 1200000 × 5/60 = 100000 amorti.
    expect(netBookValueAsOf(asset, "2024-06-01")).toBe(1_100_000);
  });
});

describe("depreciationForPeriod — linéaire", () => {
  it("calcule la dotation d'une période comme le delta des amortissements cumulés", () => {
    const asset = linearAsset();
    expect(depreciationForPeriod(asset, "2024-01-01", "2025-01-01")).toBe(240_000); // 12 mois × 20000
  });

  it("est nulle pour une période entièrement postérieure à la cession", () => {
    const asset = linearAsset({ disposal_date: "2024-07-01" });
    expect(depreciationForPeriod(asset, "2025-01-01", "2026-01-01")).toBe(0);
  });
});

describe("netBookValueAsOf / depreciationForPeriod — dégressif", () => {
  it("applique la formule exponentielle continue (taux effectif = coefficient × 1/durée)", () => {
    // linearRate = 1/4 = 0.25 ; effectiveRate = min(2×0.25, 1) = 0.5
    const asset = degressifAsset();
    expect(netBookValueAsOf(asset, "2025-01-01")).toBeCloseTo(500_000, 6); // 1000000 × 0.5^1
    expect(netBookValueAsOf(asset, "2026-01-01")).toBeCloseTo(250_000, 6); // 1000000 × 0.5^2
  });

  it("la dotation d'une période est le delta, cohérente avec les VNC ci-dessus", () => {
    const asset = degressifAsset();
    expect(depreciationForPeriod(asset, "2025-01-01", "2026-01-01")).toBeCloseTo(250_000, 6); // 750000-500000
  });

  it("un coefficient donnant un taux effectif > 100% est plafonné à 100% (pas de VNC négative ni NaN)", () => {
    // linearRate = 0.25 ; coefficient 10 → 2.5 avant clamp, clampé à 1 (100%).
    const asset = degressifAsset({ degressif_coefficient: 10 });
    expect(netBookValueAsOf(asset, "2024-07-01")).toBe(0); // amorti instantanément dès que le temps avance
    expect(Number.isNaN(netBookValueAsOf(asset, "2024-07-01"))).toBe(false);
  });

  it("un coefficient nul (dégressif mal configuré) équivaut à aucun amortissement", () => {
    const asset = degressifAsset({ degressif_coefficient: 0 });
    expect(netBookValueAsOf(asset, "2026-01-01")).toBe(1_000_000);
  });
});
