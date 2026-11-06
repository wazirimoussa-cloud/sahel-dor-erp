import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { LOGIN_EMAIL_DOMAIN, LOGIN_FORMAT_REGEX, loginToEmail } from "@/lib/loginIdentity";

describe("loginIdentity", () => {
  it("normalise l'identifiant et produit l'email synthétique", () => {
    expect(loginToEmail("  Gerant.Formation ")).toBe("gerant.formation@login.saheldor.internal");
  });

  it("refuse un format impossible (espace, trop long, caractère interdit)", () => {
    expect(loginToEmail("a b")).toBeNull();
    expect(loginToEmail("a".repeat(31))).toBeNull();
    expect(loginToEmail("gerant@x")).toBeNull();
    expect(loginToEmail("-gerant")).toBeNull();
  });

  it("reste identique aux constantes des Edge Functions (create-user crée les comptes avec)", () => {
    const shared = readFileSync(resolve(__dirname, "../../supabase/functions/_shared/constants.ts"), "utf8");
    expect(shared).toContain(`export const LOGIN_EMAIL_DOMAIN = "${LOGIN_EMAIL_DOMAIN}";`);
    expect(shared).toContain(`export const LOGIN_FORMAT_REGEX = ${LOGIN_FORMAT_REGEX.toString()};`);
  });
});
