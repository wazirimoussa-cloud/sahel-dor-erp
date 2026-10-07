import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

// Trouvé en audit pré-lancement (2026-10-07) : create-user et reset-password vérifiaient
// has_attribution('utilisateurs.gerer') puis écrivaient avec la clé service_role -- qui
// contourne la RLS -- sans comparer la société de la cible à celle de l'appelant. Dans la
// base partagée Formation/Production, un compte gérant les utilisateurs d'une société
// pouvait donc créer un compte dans une autre ou réinitialiser le mot de passe d'un de
// ses utilisateurs. Même famille de défaut que les fuites RLS déjà corrigées (0053, 0074,
// 0101, 0104), mais invisible pour rlsAttributionScoping.test.ts qui ne lit que le SQL.
//
// Analyse textuelle, comme ce dernier : toute Edge Function qui utilise la clé
// service_role doit référencer current_company_id() ; une nouvelle fonction qui oublie ce
// contrôle fait échouer ce test, sauf ajout explicite et justifié à EXEMPTIONS.

const FUNCTIONS_DIR = resolve(import.meta.dirname, "../../supabase/functions");

// request-password-reset est publique et n'accepte aucune cible choisie par l'appelant
// pour une écriture : elle n'envoie un lien qu'au compte admin réel, quel que soit
// l'email fourni, et répond toujours le même message.
const EXEMPTIONS: Record<string, string> = {
  "request-password-reset": "publique, aucune écriture sur une cible choisie par l'appelant",
};

const functionDirs = readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
  .map((entry) => entry.name);

const usingServiceRole = functionDirs.filter((name) =>
  readFileSync(resolve(FUNCTIONS_DIR, name, "index.ts"), "utf-8").includes("SERVICE_ROLE_KEY"),
);

describe("Edge Functions service_role restent scopées à la société de l'appelant", () => {
  it("trouve bien des fonctions à analyser (le test n'est pas silencieusement vide)", () => {
    expect(usingServiceRole).toEqual(expect.arrayContaining(["create-user", "reset-password"]));
  });

  it.each(usingServiceRole.filter((name) => !(name in EXEMPTIONS)))(
    "%s compare la société de l'appelant (current_company_id) avant d'écrire",
    (name) => {
      const source = readFileSync(resolve(FUNCTIONS_DIR, name, "index.ts"), "utf-8");
      expect(
        source.includes("current_company_id"),
        `L'Edge Function "${name}" utilise la clé service_role (hors RLS) sans référencer ` +
          `current_company_id() -- un compte avec utilisateurs.gerer dans N'IMPORTE QUELLE société ` +
          `pourrait agir sur les utilisateurs d'une autre. Déjà trouvé dans create-user et ` +
          `reset-password ; ne pas réintroduire ce motif.`,
      ).toBe(true);
    },
  );
});
