import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

// Trouvé en audit pré-lancement : le même bug s'est produit 3 fois dans l'historique de
// ce projet (users_select/users_admin_write entre 0052 et 0074 ; companies_admin_write
// entre 0050 et 0053 ; employees_select/payslips_select/salary_advances_select/
// leave_records_select jusqu'à 0099) -- une policy RLS qui vérifie has_attribution(...)
// mais oublie de filtrer sur la société, laissant fuiter les données d'une société vers
// une autre qui partage la même attribution. Ce test lit directement les migrations
// SQL (pas de connexion Supabase requise) et vérifie que TOUTE policy actuelle
// contenant has_attribution( référence aussi la société (company_id ou
// current_company_id()) dans le même bloc -- l'aurait fait échouer aux 3 occurrences
// historiques ci-dessus, avant leur correction.
//
// Limite assumée : analyse textuelle, pas un vrai parseur SQL. Repose sur une
// convention déjà constante dans tout le dépôt (vérifiée à la lecture de ~100
// migrations) : le corps d'une policy (using/with check) est une expression booléenne
// simple, jamais un sous-bloc contenant lui-même un point-virgule -- donc le premier
// `;` après `create policy` marque fiablement la fin de l'instruction.

const MIGRATIONS_DIR = resolve(import.meta.dirname, "../../supabase/migrations");

interface PolicyEvent {
  index: number; // position globale (fichier + position), pour trier dans l'ordre chronologique
  type: "create" | "drop";
  name: string;
  table: string;
  body?: string;
}

function collectPolicyEvents(): PolicyEvent[] {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const events: PolicyEvent[] = [];
  let globalOffset = 0;

  for (const file of files) {
    const sql = readFileSync(resolve(MIGRATIONS_DIR, file), "utf-8");

    const createRe = /create\s+policy\s+(\S+)\s+on\s+public\.(\w+)/gi;
    for (const m of sql.matchAll(createRe)) {
      const semicolon = sql.indexOf(";", m.index);
      const body = semicolon === -1 ? sql.slice(m.index) : sql.slice(m.index, semicolon);
      events.push({
        index: globalOffset + m.index,
        type: "create",
        name: m[1],
        table: m[2],
        body,
      });
    }

    const dropRe = /drop\s+policy\s+(?:if\s+exists\s+)?(\S+)\s+on\s+public\.(\w+)/gi;
    for (const m of sql.matchAll(dropRe)) {
      events.push({ index: globalOffset + m.index, type: "drop", name: m[1], table: m[2] });
    }

    globalOffset += sql.length + 1;
  }

  return events.sort((a, b) => a.index - b.index);
}

// Reconstruit l'état courant du schéma (nom de policy -> corps actuel, ou absente si
// supprimée sans avoir été recréée depuis) en rejouant tous les create/drop dans l'ordre.
function currentPolicies(): Map<string, { table: string; body: string }> {
  const current = new Map<string, { table: string; body: string }>();
  for (const event of collectPolicyEvents()) {
    const key = `${event.table}.${event.name}`;
    if (event.type === "drop") {
      current.delete(key);
    } else {
      current.set(key, { table: event.table, body: event.body as string });
    }
  }
  return current;
}

describe("policies RLS gardées par has_attribution() restent scopées à la société", () => {
  const policies = currentPolicies();

  it("trouve bien des policies à analyser (le test n'est pas silencieusement vide)", () => {
    expect(policies.size).toBeGreaterThan(20);
  });

  const withAttribution = [...policies.entries()].filter(([, p]) => p.body.includes("has_attribution("));

  it("au moins une policy utilise has_attribution() (sinon ce test ne teste rien)", () => {
    expect(withAttribution.length).toBeGreaterThan(0);
  });

  it.each(withAttribution)("%s référence aussi la société (company_id) dans son corps", (key, policy) => {
    const scoped = policy.body.includes("current_company_id()") || policy.body.includes("company_id");
    expect(
      scoped,
      `La policy "${key}" vérifie has_attribution(...) sans filtrer sur company_id/current_company_id() ` +
        `-- un compte avec cette attribution dans N'IMPORTE QUELLE société pourrait alors accéder aux lignes ` +
        `de toutes les sociétés. Corps analysé :\n${policy.body}`,
    ).toBe(true);
  });

  // Trouvé en audit RLS (2026-09-25, demandé explicitement) : une variante du même bug,
  // pas couverte par le test ci-dessus car sans has_attribution() -- 4 policies
  // (fiscal_rate_history_select, purchase_loss_recoveries_select,
  // purchase_loss_writeoffs_select, purchase_transport_payments_select) contournaient le
  // scope société via `current_role_name() = 'admin' OR company_id = ...`, donnant à
  // l'unique compte admin legacy (role_id = 1) une visibilité cross-société. Corrigé en
  // 0104_retire_bypass_admin_cross_societe_restant.sql. Ce test verrouille : plus aucune
  // policy actuelle ne doit réintroduire ce contournement.
  it.each([...policies.entries()])("%s ne contourne pas le scope société via current_role_name() = 'admin'", (key, policy) => {
    expect(
      policy.body.includes("current_role_name() = 'admin'"),
      `La policy "${key}" donne une visibilité cross-société à quiconque a current_role_name() = 'admin' ` +
        `-- déjà corrigé 4 fois dans l'historique de ce projet (0053, 0074, 0101, 0104), ne pas réintroduire ` +
        `ce motif. Corps analysé :\n${policy.body}`,
    ).toBe(false);
  });
});
