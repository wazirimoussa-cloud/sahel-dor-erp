import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { hasCredentials, signInAs } from "./helpers/auth";

// RLS par module en lecture (0106_rls_lecture_par_module.sql) contre Formation, requêtes
// REST directes (hors UI) : la barrière doit être en base, pas dans la navigation.
// Complète tests/unit/rlsAttributionScoping.test.ts, qui vérifie le texte des policies.
//
// Profils (supabase/scripts/provision-formation-auth.mjs) :
//  - superviseur : tous les modules concernés -> référence (voit tout ce qui existe).
//  - magasinier  : achats (réception), pertes_stock, transporteurs, entrepôts, stock --
//                  ni ventes, ni production, ni transformation.
//  - gerant      : achats, ventes, production, transformation -- ni pertes_stock, ni
//                  transporteurs, ni module comptable.
//  - comptable   : modules comptables + ventes (encaisser_paiement) -- ni achats,
//                  ni production, ni transformation.
//
// Un "0 ligne" n'a de sens que si la table contient des données : chaque cas compare au
// compte du superviseur, et le signale s'il est nul (Formation fraîchement remise à zéro).

type Client = SupabaseClient<Database>;
type GatedTable = "orders" | "purchases" | "stock_loss_requests" | "productions" | "transformations";

async function count(client: Client, table: GatedTable): Promise<number> {
  const { count: n, error } = await client.from(table).select("id", { count: "exact", head: true });
  expect(error).toBeNull();
  return n ?? 0;
}

describe.skipIf(!hasCredentials)("RLS par module en lecture (Formation, réel)", () => {
  let superviseur: Client;
  let magasinier: Client;
  let gerant: Client;
  let comptable: Client;

  beforeAll(async () => {
    superviseur = await signInAs("superviseur");
    magasinier = await signInAs("magasinier");
    gerant = await signInAs("gerant");
    comptable = await signInAs("comptable");
  });

  afterAll(async () => {
    await Promise.all([superviseur, magasinier, gerant, comptable].map((c) => c?.auth.signOut()));
  });

  const hidden: [string, () => Client, GatedTable][] = [
    ["magasinier ne lit pas les commandes (pas de ventes)", () => magasinier, "orders"],
    ["magasinier ne lit pas les productions", () => magasinier, "productions"],
    ["magasinier ne lit pas les transformations", () => magasinier, "transformations"],
    ["gerant ne lit pas les pertes de stock (ni pertes_stock ni comptabilité)", () => gerant, "stock_loss_requests"],
    ["comptable ne lit pas les achats", () => comptable, "purchases"],
    ["comptable ne lit pas les productions", () => comptable, "productions"],
  ];

  it.each(hidden)("%s", async (_label, getClient, table) => {
    const reference = await count(superviseur, table);
    if (reference === 0) console.warn(`[rls-modules] ${table} vide sur Formation -- cas peu probant`);
    expect(await count(getClient(), table)).toBe(0);
  });

  const visible: [string, () => Client, GatedTable][] = [
    ["magasinier lit les achats (réception)", () => magasinier, "purchases"],
    ["magasinier lit les pertes de stock", () => magasinier, "stock_loss_requests"],
    ["gerant lit les commandes", () => gerant, "orders"],
    ["gerant lit les productions", () => gerant, "productions"],
    ["comptable lit les commandes (encaissement)", () => comptable, "orders"],
    ["comptable lit les pertes de stock (bilan, v_stock_loss_valued)", () => comptable, "stock_loss_requests"],
  ];

  it.each(visible)("%s", async (_label, getClient, table) => {
    expect(await count(getClient(), table)).toBe(await count(superviseur, table));
  });

  it("une table enfant suit son parent : magasinier ne lit aucune ligne de commande", async () => {
    const { data, error } = await magasinier.from("order_items").select("id").limit(1);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
