import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Verrouille le Content-Security-Policy ajouté suite à l'audit pré-lancement (2026-10-07).
// Lecture directe de vercel.json et index.html : aucun serveur requis. Un CSP dont
// script-src accepte 'unsafe-inline' ou 'unsafe-eval' n'arrêterait plus l'injection de
// script, et un gestionnaire inline (onload=...) dans index.html casserait la page dès
// que le CSP est appliqué -- c'est exactement le cas rencontré avec le chargement de la
// police Google, corrigé en déplaçant la bascule dans src/main.tsx.

const ROOT = resolve(import.meta.dirname, "../..");
const vercel = JSON.parse(readFileSync(resolve(ROOT, "vercel.json"), "utf-8")) as {
  headers: { headers: { key: string; value: string }[] }[];
};
const indexHtml = readFileSync(resolve(ROOT, "index.html"), "utf-8");

const csp =
  vercel.headers
    .flatMap((h) => h.headers)
    .find((h) => h.key === "Content-Security-Policy")?.value ?? "";

function directive(name: string): string {
  return (
    csp
      .split(";")
      .map((d) => d.trim())
      .find((d) => d.startsWith(`${name} `)) ?? ""
  );
}

describe("Content-Security-Policy (vercel.json)", () => {
  it("est défini", () => {
    expect(csp).not.toBe("");
  });

  it("script-src n'autorise ni 'unsafe-inline' ni 'unsafe-eval'", () => {
    const scriptSrc = directive("script-src");
    expect(scriptSrc).not.toBe("");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });

  it("garde les directives de cloisonnement (default-src, object-src, frame-ancestors)", () => {
    expect(directive("default-src")).toContain("'self'");
    expect(directive("object-src")).toContain("'none'");
    expect(directive("frame-ancestors")).toContain("'none'");
  });

  it("n'autorise jamais un schéma ou un joker global dans script-src", () => {
    const scriptSrc = directive("script-src");
    expect(scriptSrc).not.toMatch(/\s\*(\s|$)/);
    expect(scriptSrc).not.toMatch(/\shttps?:(\s|$)/);
  });
});

describe("index.html compatible avec ce CSP", () => {
  it("ne contient aucun gestionnaire d'événement inline (onload=, onclick=, ...)", () => {
    expect(indexHtml).not.toMatch(/\son[a-z]+\s*=/i);
  });

  it("ne contient aucun <script> inline (seul un module externe est autorisé)", () => {
    const inline = [...indexHtml.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(
      ([, attrs, body]) => !/\bsrc=/.test(attrs) && body.trim() !== "",
    );
    expect(inline).toHaveLength(0);
  });
});
