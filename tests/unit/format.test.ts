import { describe, expect, it } from "vitest";
import { formatFCFA, formatNumber } from "@/lib/format";

describe("formatNumber", () => {
  it("separe les milliers avec un espace normal, jamais l'espace insecable etroit de toLocaleString", () => {
    const result = formatNumber(700500);
    expect(result).toBe("700 500");
    const codes = [...result].map((c) => c.charCodeAt(0));
    expect(codes).not.toContain(0x202f); // espace insecable etroit
    expect(codes).not.toContain(0x00a0); // espace insecable normal
  });

  it("ne touche pas les decimales", () => {
    expect(formatNumber(1234567.89)).toBe("1 234 567,89");
  });
});

describe("formatFCFA", () => {
  it("arrondit et ajoute le suffixe", () => {
    expect(formatFCFA(700500.4)).toBe("700 500 FCFA");
  });

  it("traite null/undefined comme 0", () => {
    expect(formatFCFA(null)).toBe("0 FCFA");
    expect(formatFCFA(undefined)).toBe("0 FCFA");
  });
});
