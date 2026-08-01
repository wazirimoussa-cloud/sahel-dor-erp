import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

// Vérifie 0051_production_journal_entry.sql contre Formation (RLS + attributions
// réelles, zéro mock) : une production génère désormais une écriture "production
// stockée" (débit 36, crédit 73) -- une transformation, elle, reste neutre (aucune
// écriture), traitement confirmé avec l'utilisateur (voir le plan de cette session).
// Sans ce test, rien ne détecterait une régression future sur ce point précis.
//
// Nécessite les comptes provisoires Formation -- voir .env.example. Suite ignorée
// (jamais en échec) si les identifiants sont absents.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

const CREDENTIALS = {
  gerant: {
    email: process.env.TEST_GERANT_EMAIL,
    password: process.env.TEST_GERANT_PASSWORD,
  },
  comptable: {
    email: process.env.TEST_COMPTABLE_EMAIL,
    password: process.env.TEST_COMPTABLE_PASSWORD,
  },
} as const;

const hasCredentials =
  Boolean(SUPABASE_URL) &&
  Boolean(SUPABASE_ANON_KEY) &&
  Object.values(CREDENTIALS).every((c) => c.email && c.password);

if (!hasCredentials) {
  console.warn(
    "[integration] Comptes/URL Supabase absents de l'environnement -- suite ignorée. " +
      "Voir .env.example (TEST_GERANT_EMAIL, TEST_GERANT_PASSWORD).",
  );
}

async function signInAs(role: keyof typeof CREDENTIALS): Promise<SupabaseClient<Database>> {
  const { email, password } = CREDENTIALS[role];
  const client = createClient<Database>(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email: email as string,
    password: password as string,
  });
  if (error) {
    throw new Error(`Connexion échouée pour le profil ${role} (${email}) : ${error.message}`);
  }
  return client;
}

describe.skipIf(!hasCredentials)("écriture comptable production (Formation, réel)", () => {
  let gerant: SupabaseClient<Database>;
  let comptable: SupabaseClient<Database>;
  let companyId: string;
  let warehouseId: string;
  const tag = `Intégration production ${new Date().toISOString()}`;

  beforeAll(async () => {
    gerant = await signInAs("gerant");
    // Le Gérant ne détient pas journal_comptable.consulter (voir la répartition des
    // attributions) : la vérification des écritures se fait avec le Comptable, comme
    // dans purchase-to-payment.test.ts.
    comptable = await signInAs("comptable");

    const { data: gerantRow, error: gerantErr } = await gerant
      .from("users")
      .select("company_id")
      .eq("email", CREDENTIALS.gerant.email as string)
      .single();
    if (gerantErr || !gerantRow?.company_id) {
      throw new Error(`Impossible de résoudre la société du Gérant : ${gerantErr?.message}`);
    }
    companyId = gerantRow.company_id;

    const { data: warehouse, error: warehouseErr } = await gerant
      .from("warehouses")
      .select("id")
      .eq("company_id", companyId)
      .eq("active", true)
      .limit(1)
      .single();
    if (warehouseErr || !warehouse) {
      throw new Error(`Aucun magasin actif disponible pour le test : ${warehouseErr?.message}`);
    }
    warehouseId = warehouse.id;
  });

  afterAll(async () => {
    await Promise.all([gerant?.auth.signOut(), comptable?.auth.signOut()]);
  });

  it("une production génère une écriture PRODUCTION équilibrée (débit 36 = crédit 73)", async () => {
    const { data: product, error: productErr } = await gerant
      .from("products")
      .insert({
        company_id: companyId,
        name: `Produit ${tag}`,
        price: 2000,
        stock: 0,
        unit: "unité",
        vat_exempt: false,
      })
      .select("id")
      .single();
    expect(productErr).toBeNull();

    const { data: production, error: productionErr } = await gerant.rpc("create_production", {
      payload: {
        warehouse_id: warehouseId,
        items: [{ product_id: product!.id, quantity: 10, unit_cost: 3000 }],
      },
    });
    expect(productionErr).toBeNull();

    const { data: entries, error: entriesErr } = await comptable
      .from("journal_entries")
      .select("id, journal_code, journal_entry_lines(debit, credit, chart_of_accounts(code))")
      .eq("production_id", production!.id);
    expect(entriesErr).toBeNull();
    expect(entries).toHaveLength(1);
    expect(entries![0].journal_code).toBe("PRODUCTION");

    const lines = entries![0].journal_entry_lines as unknown as {
      debit: number;
      credit: number;
      chart_of_accounts: { code: string } | { code: string }[] | null;
    }[];
    expect(lines).toHaveLength(2);

    const codeOf = (line: (typeof lines)[number]) => {
      const coa = line.chart_of_accounts;
      return Array.isArray(coa) ? coa[0]?.code : coa?.code;
    };

    const debitLine = lines.find((l) => Number(l.debit) > 0);
    const creditLine = lines.find((l) => Number(l.credit) > 0);
    expect(codeOf(debitLine!)).toBe("36");
    expect(codeOf(creditLine!)).toBe("73");
    // 10 unités x 3000 FCFA = 30 000, l'écriture doit être équilibrée sur ce montant.
    expect(Number(debitLine!.debit)).toBe(30000);
    expect(Number(creditLine!.credit)).toBe(30000);
  });

  it("une transformation ne génère toujours aucune écriture", async () => {
    const { data: inputProduct } = await gerant
      .from("products")
      .insert({
        company_id: companyId,
        name: `Intrant ${tag}`,
        price: 1000,
        stock: 0,
        unit: "unité",
        vat_exempt: false,
      })
      .select("id")
      .single();
    const { data: outputProduct } = await gerant
      .from("products")
      .insert({
        company_id: companyId,
        name: `Extrant ${tag}`,
        price: 1500,
        stock: 0,
        unit: "unité",
        vat_exempt: false,
      })
      .select("id")
      .single();

    // Le Gérant doit d'abord détenir un peu de stock de l'intrant pour pouvoir le
    // consommer -- une production rapide sert de fixture, pas l'objet du test.
    await gerant.rpc("create_production", {
      payload: {
        warehouse_id: warehouseId,
        items: [{ product_id: inputProduct!.id, quantity: 20, unit_cost: 1000 }],
      },
    });

    const { data: entriesBefore, error: entriesBeforeErr } = await comptable
      .from("journal_entries")
      .select("id")
      .eq("company_id", companyId);
    expect(entriesBeforeErr).toBeNull();
    const countBefore = entriesBefore?.length ?? 0;

    const { error: transformationErr } = await gerant.rpc("create_transformation", {
      payload: {
        warehouse_id: warehouseId,
        inputs: [{ product_id: inputProduct!.id, quantity: 5 }],
        outputs: [{ product_id: outputProduct!.id, quantity: 3 }],
      },
    });
    expect(transformationErr).toBeNull();

    const { data: entriesAfter, error: entriesAfterErr } = await comptable
      .from("journal_entries")
      .select("id")
      .eq("company_id", companyId);
    expect(entriesAfterErr).toBeNull();
    // La production de fixture ci-dessus a déjà généré sa propre écriture (comptée
    // dans countBefore) -- seule la transformation elle-même ne doit rien ajouter.
    expect(entriesAfter?.length ?? 0).toBe(countBefore);
  });
});
