import { describe, expect, it } from "vitest";

// Reproduit ici la logique de src/features/stock/StockMovementForm.tsx qui calcule le
// signe envoyé au serveur : IN/OUT sont toujours positifs (la direction vient du type),
// ADJUSTMENT porte le signe choisi par l'utilisateur. Le trigger fn_apply_transaction_stock
// (0002_functions_triggers.sql) applique ensuite ce signe au stock côté DB.
function normalizeQuantity(type: "IN" | "OUT" | "ADJUSTMENT", quantity: number) {
  return type === "ADJUSTMENT" ? quantity : Math.abs(quantity);
}

describe("normalizeQuantity", () => {
  it("garde la quantité positive pour une entrée", () => {
    expect(normalizeQuantity("IN", -3)).toBe(3);
  });

  it("garde la quantité positive pour une sortie", () => {
    expect(normalizeQuantity("OUT", 5)).toBe(5);
  });

  it("conserve le signe pour un ajustement négatif", () => {
    expect(normalizeQuantity("ADJUSTMENT", -2)).toBe(-2);
  });

  it("conserve le signe pour un ajustement positif", () => {
    expect(normalizeQuantity("ADJUSTMENT", 2)).toBe(2);
  });
});
