import { describe, expect, it } from "vitest";
import { computeVatBreakdown, type VatLineItem } from "@/lib/vat";

function item(quantity: number, unitPrice: number, vatExempt = false, vatReduced = false): VatLineItem {
  return { quantity, unitPrice, vatExempt, vatReduced };
}

describe("computeVatBreakdown", () => {
  it("applique le taux normal à une ligne standard", () => {
    const result = computeVatBreakdown([item(2, 500_000)], 19, 5);
    expect(result.totalHT).toBe(1_000_000);
    expect(result.vatAmount).toBe(190_000);
    expect(result.totalTTC).toBe(1_190_000);
  });

  it("applique le taux réduit à une ligne sucre/huile", () => {
    const result = computeVatBreakdown([item(2, 500_000, false, true)], 19, 5);
    expect(result.totalHT).toBe(1_000_000);
    expect(result.vatAmount).toBe(50_000);
    expect(result.totalTTC).toBe(1_050_000);
  });

  it("n'applique aucune TVA à une ligne exonérée", () => {
    const result = computeVatBreakdown([item(2, 500_000, true, false)], 19, 5);
    expect(result.totalHT).toBe(1_000_000);
    expect(result.vatAmount).toBe(0);
    expect(result.totalTTC).toBe(1_000_000);
  });

  it("mélange les 3 paliers sur une même commande", () => {
    const result = computeVatBreakdown(
      [
        item(1, 100_000), // standard, 19% -> 19 000
        item(1, 200_000, false, true), // réduit, 5% -> 10 000
        item(1, 50_000, true, false), // exonéré -> 0
      ],
      19,
      5,
    );
    expect(result.totalHT).toBe(350_000);
    expect(result.vatAmount).toBe(29_000);
    expect(result.totalTTC).toBe(379_000);
  });

  it("liste vide renvoie des totaux nuls", () => {
    const result = computeVatBreakdown([], 19, 5);
    expect(result.totalHT).toBe(0);
    expect(result.vatAmount).toBe(0);
    expect(result.totalTTC).toBe(0);
  });
});
