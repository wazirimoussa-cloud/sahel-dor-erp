import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

// Complète la couverture d'intégration sur les opérations à fort volume qui n'avaient
// encore aucune garde automatisée : mouvement manuel de stock, transfert entre
// magasins, pertes de stock (déclaration/approbation/rejet/reconditionnement) et
// immobilisations. Même approche que les autres fichiers de ce dossier : RPC/insertions
// réelles contre Formation (RLS + attributions, zéro mock).
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
  magasinier: {
    email: process.env.TEST_MAGASINIER_EMAIL,
    password: process.env.TEST_MAGASINIER_PASSWORD,
  },
  superviseur: {
    email: process.env.TEST_SUPERVISEUR_EMAIL,
    password: process.env.TEST_SUPERVISEUR_PASSWORD,
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
      "Voir .env.example (TEST_GERANT_EMAIL, TEST_GERANT_PASSWORD, etc.).",
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

async function seedStock(
  gerant: SupabaseClient<Database>,
  companyId: string,
  warehouseId: string,
  tag: string,
  quantity: number,
  unitCost: number,
) {
  const { data: product, error: productErr } = await gerant
    .from("products")
    .insert({
      company_id: companyId,
      name: `Produit ${tag}`,
      price: unitCost,
      stock: 0,
      unit: "unité",
      vat_exempt: false,
    })
    .select("id")
    .single();
  if (productErr || !product) throw new Error(`Création produit échouée : ${productErr?.message}`);

  const { error: productionErr } = await gerant.rpc("create_production", {
    payload: {
      warehouse_id: warehouseId,
      items: [{ product_id: product.id, quantity, unit_cost: unitCost }],
    },
  });
  if (productionErr) throw new Error(`Production de départ échouée : ${productionErr.message}`);

  return product.id;
}

describe.skipIf(!hasCredentials)("mouvements, transferts, pertes et immobilisations (Formation, réel)", () => {
  let gerant: SupabaseClient<Database>;
  let magasinier: SupabaseClient<Database>;
  let superviseur: SupabaseClient<Database>;
  let comptable: SupabaseClient<Database>;

  let companyId: string;
  let warehouseId: string;
  let magasinierUserId: string;
  const tag = `Intégration stock ${new Date().toISOString()}`;

  beforeAll(async () => {
    gerant = await signInAs("gerant");
    magasinier = await signInAs("magasinier");
    superviseur = await signInAs("superviseur");
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

    const { data: magasinierAuth } = await magasinier.auth.getUser();
    if (!magasinierAuth.user) throw new Error("Impossible de résoudre l'utilisateur Magasinier");
    magasinierUserId = magasinierAuth.user.id;
  });

  afterAll(async () => {
    await Promise.all([
      gerant?.auth.signOut(),
      magasinier?.auth.signOut(),
      superviseur?.auth.signOut(),
      comptable?.auth.signOut(),
    ]);
  });

  it("un mouvement manuel de stock met à jour le stock disponible", async () => {
    const productId = await seedStock(gerant, companyId, warehouseId, `${tag} A`, 10, 1000);

    const { error: insertErr } = await magasinier.from("transactions").insert({
      product_id: productId,
      warehouse_id: warehouseId,
      type: "OUT",
      quantity: 4,
      user_id: magasinierUserId,
      note: "Sortie test intégration",
    });
    expect(insertErr).toBeNull();

    const { data: stock, error: stockErr } = await magasinier
      .from("product_stocks")
      .select("stock")
      .eq("product_id", productId)
      .eq("warehouse_id", warehouseId)
      .single();
    expect(stockErr).toBeNull();
    expect(Number(stock?.stock)).toBe(6);
  });

  it("un transfert déplace le stock entre deux magasins avec héritage du coût", async () => {
    const productId = await seedStock(gerant, companyId, warehouseId, `${tag} B`, 10, 2000);

    const { data: destWarehouse, error: destErr } = await magasinier
      .from("warehouses")
      .insert({ company_id: companyId, name: `Magasin ${tag} B` })
      .select("id")
      .single();
    expect(destErr).toBeNull();

    const { error: transferErr } = await magasinier.rpc("transfer_stock", {
      p_product_id: productId,
      p_from_warehouse_id: warehouseId,
      p_to_warehouse_id: destWarehouse!.id,
      p_quantity: 4,
    });
    expect(transferErr).toBeNull();

    const { data: sourceStock } = await magasinier
      .from("product_stocks")
      .select("stock")
      .eq("product_id", productId)
      .eq("warehouse_id", warehouseId)
      .single();
    expect(Number(sourceStock?.stock)).toBe(6);

    const { data: destStock } = await magasinier
      .from("product_stocks")
      .select("stock")
      .eq("product_id", productId)
      .eq("warehouse_id", destWarehouse!.id)
      .single();
    expect(Number(destStock?.stock)).toBe(4);

    const { data: destLot } = await magasinier
      .from("stock_lots")
      .select("unit_cost")
      .eq("product_id", productId)
      .eq("warehouse_id", destWarehouse!.id)
      .single();
    expect(Number(destLot?.unit_cost)).toBe(2000);
  });

  it("une perte sèche approuvée retire la quantité du stock", async () => {
    const productId = await seedStock(gerant, companyId, warehouseId, `${tag} C`, 10, 1000);

    const { data: request, error: requestErr } = await magasinier.rpc("request_stock_loss", {
      p_product_id: productId,
      p_warehouse_id: warehouseId,
      p_quantity: 3,
      p_reason: "Sacs déchirés -- test intégration",
    });
    expect(requestErr).toBeNull();

    const { error: approveErr } = await superviseur.rpc("approve_stock_loss", {
      p_request_id: request!.id,
    });
    expect(approveErr).toBeNull();

    const { data: stock } = await superviseur
      .from("product_stocks")
      .select("stock")
      .eq("product_id", productId)
      .eq("warehouse_id", warehouseId)
      .single();
    expect(Number(stock?.stock)).toBe(7);
  });

  it("un reconditionnement approuvé génère une transformation intrant=extrant", async () => {
    const productId = await seedStock(gerant, companyId, warehouseId, `${tag} D`, 10, 1000);

    const { data: request, error: requestErr } = await magasinier.rpc("request_stock_loss", {
      p_product_id: productId,
      p_warehouse_id: warehouseId,
      p_quantity: 5,
      p_reason: "Sac abîmé, contenu récupéré -- test intégration",
      p_repackaged_quantity: 4,
    });
    expect(requestErr).toBeNull();

    const { data: approved, error: approveErr } = await superviseur.rpc("approve_stock_loss", {
      p_request_id: request!.id,
    });
    expect(approveErr).toBeNull();
    expect(approved?.transformation_id).not.toBeNull();

    // 10 initial - 5 consommées (intrant) + 4 récupérées (extrant) = 9.
    const { data: stock } = await superviseur
      .from("product_stocks")
      .select("stock")
      .eq("product_id", productId)
      .eq("warehouse_id", warehouseId)
      .single();
    expect(Number(stock?.stock)).toBe(9);
  });

  it("une perte rejetée ne modifie pas le stock", async () => {
    const productId = await seedStock(gerant, companyId, warehouseId, `${tag} E`, 10, 1000);

    const { data: request, error: requestErr } = await magasinier.rpc("request_stock_loss", {
      p_product_id: productId,
      p_warehouse_id: warehouseId,
      p_quantity: 3,
      p_reason: "Test rejet intégration",
    });
    expect(requestErr).toBeNull();

    const { data: rejected, error: rejectErr } = await superviseur.rpc("reject_stock_loss", {
      p_request_id: request!.id,
      p_rejection_reason: "Justificatif insuffisant -- test intégration",
    });
    expect(rejectErr).toBeNull();
    expect(rejected?.status).toBe("rejected");

    const { data: stock } = await superviseur
      .from("product_stocks")
      .select("stock")
      .eq("product_id", productId)
      .eq("warehouse_id", warehouseId)
      .single();
    expect(Number(stock?.stock)).toBe(10);
  });

  it("le Magasinier ne peut pas approuver sa propre déclaration de perte (séparation des tâches)", async () => {
    const productId = await seedStock(gerant, companyId, warehouseId, `${tag} F`, 10, 1000);

    const { data: request, error: requestErr } = await magasinier.rpc("request_stock_loss", {
      p_product_id: productId,
      p_warehouse_id: warehouseId,
      p_quantity: 2,
      p_reason: "Test séparation des tâches",
    });
    expect(requestErr).toBeNull();

    const { error: selfApproveErr } = await magasinier.rpc("approve_stock_loss", {
      p_request_id: request!.id,
    });
    expect(selfApproveErr).not.toBeNull();
    expect(selfApproveErr?.message).toMatch(/non autorisé/i);
  });

  it("une immobilisation acquise génère une écriture équilibrée (débit 21, crédit 521), la cession la retire du bilan", async () => {
    const { data: asset, error: createErr } = await comptable.rpc("create_fixed_asset", {
      p_name: `Immobilisation ${tag}`,
      p_category: "Matériel",
      p_acquisition_date: new Date().toISOString().slice(0, 10),
      p_acquisition_cost: 500000,
      p_useful_life_years: 5,
    });
    expect(createErr).toBeNull();

    const { data: entries, error: entriesErr } = await comptable
      .from("journal_entries")
      .select("journal_code, journal_entry_lines(debit, credit, chart_of_accounts(code))")
      .eq("company_id", companyId)
      .eq("journal_code", "IMMOBILISATIONS")
      .order("created_at", { ascending: false })
      .limit(1);
    expect(entriesErr).toBeNull();
    expect(entries).toHaveLength(1);

    const lines = entries![0].journal_entry_lines as unknown as {
      debit: number;
      credit: number;
      chart_of_accounts: { code: string } | { code: string }[] | null;
    }[];
    const codeOf = (line: (typeof lines)[number]) => {
      const coa = line.chart_of_accounts;
      return Array.isArray(coa) ? coa[0]?.code : coa?.code;
    };
    const debitLine = lines.find((l) => Number(l.debit) > 0);
    const creditLine = lines.find((l) => Number(l.credit) > 0);
    expect(codeOf(debitLine!)).toBe("21");
    expect(codeOf(creditLine!)).toBe("521");
    expect(Number(debitLine!.debit)).toBe(500000);
    expect(Number(creditLine!.credit)).toBe(500000);

    const { error: disposeErr } = await comptable.rpc("dispose_fixed_asset", {
      p_asset_id: asset!.id,
      p_disposal_date: new Date().toISOString().slice(0, 10),
      p_disposal_price: 0,
    });
    expect(disposeErr).toBeNull();

    const { data: disposed } = await comptable
      .from("fixed_assets")
      .select("disposal_date")
      .eq("id", asset!.id)
      .single();
    expect(disposed?.disposal_date).not.toBeNull();
  });

  // Trois scénarios de cession (0066_cession_immobilisations.sql) : la cession postait
  // jusqu'ici uniquement disposal_date, sans écriture -- ces tests vérifient les deux
  // écritures désormais générées (sortie du bien 28/675/21, encaissement 521/775). Les
  // deux écritures sont postées dans la même transaction, donc created_at est identique
  // (now() est stable par transaction) -- on les distingue par le préfixe de description,
  // jamais par un ordre de tri, qui n'est pas garanti en cas d'égalité.
  async function createTestAsset(nameSuffix: string, acquisitionDate: string) {
    const assetName = `Immobilisation cession ${tag} ${nameSuffix}`;
    const { data: asset, error } = await comptable.rpc("create_fixed_asset", {
      p_name: assetName,
      p_category: "Matériel",
      p_acquisition_date: acquisitionDate,
      p_acquisition_cost: 400000,
      p_useful_life_years: 4,
    });
    expect(error).toBeNull();
    return { ...asset!, name: assetName };
  }

  async function entriesForAsset(assetName: string) {
    const { data: allEntries, error } = await comptable
      .from("journal_entries")
      .select("description, journal_entry_lines(debit, credit, chart_of_accounts(code))")
      .eq("company_id", companyId)
      .eq("journal_code", "IMMOBILISATIONS")
      .ilike("description", `%${assetName}`);
    expect(error).toBeNull();
    // Exclut l'écriture d'acquisition (même journal_code, même suffixe de description) --
    // seules les écritures de cession (sortie/encaissement) intéressent ces tests.
    const entries = allEntries!.filter((e) => !e.description.startsWith("Acquisition "));
    const sortie = entries.find((e) => e.description.startsWith("Sortie "));
    const encaissement = entries.find((e) => e.description.startsWith("Encaissement cession "));
    return { entries, sortie, encaissement };
  }

  function linesOf(entry: {
    journal_entry_lines: {
      debit: number;
      credit: number;
      chart_of_accounts: { code: string } | { code: string }[] | null;
    }[];
  }) {
    const codeOf = (line: (typeof entry.journal_entry_lines)[number]) => {
      const coa = line.chart_of_accounts;
      return Array.isArray(coa) ? coa[0]?.code : coa?.code;
    };
    return Object.fromEntries(entry.journal_entry_lines.map((l) => [codeOf(l), l]));
  }

  it("une cession en plus-value génère une écriture de sortie (28/675/21) et une écriture d'encaissement (521/775)", async () => {
    const acquisitionDate = new Date().toISOString().slice(0, 10);
    const asset = await createTestAsset("plus-value", acquisitionDate);

    // Cession le jour même de l'acquisition : amortissement cumulé nul, VNC = coût.
    const { error: disposeErr } = await comptable.rpc("dispose_fixed_asset", {
      p_asset_id: asset.id,
      p_disposal_date: acquisitionDate,
      p_disposal_price: 550000,
    });
    expect(disposeErr).toBeNull();

    const { sortie, encaissement } = await entriesForAsset(asset.name);
    expect(sortie).toBeDefined();
    expect(encaissement).toBeDefined();

    const sortieLines = linesOf(sortie!);
    expect(Number(sortieLines["28"]?.debit)).toBe(0);
    expect(Number(sortieLines["675"]?.debit)).toBe(400000);
    expect(Number(sortieLines["21"]?.credit)).toBe(400000);

    const encaissementLines = linesOf(encaissement!);
    expect(Number(encaissementLines["521"]?.debit)).toBe(550000);
    expect(Number(encaissementLines["775"]?.credit)).toBe(550000);
  });

  it("une cession en moins-value (prix inférieur à la VNC) génère les mêmes écritures avec un produit réduit", async () => {
    const acquisitionDate = new Date().toISOString().slice(0, 10);
    const asset = await createTestAsset("moins-value", acquisitionDate);

    const { error: disposeErr } = await comptable.rpc("dispose_fixed_asset", {
      p_asset_id: asset.id,
      p_disposal_date: acquisitionDate,
      p_disposal_price: 100000,
    });
    expect(disposeErr).toBeNull();

    const { sortie, encaissement } = await entriesForAsset(asset.name);
    expect(sortie).toBeDefined();
    expect(encaissement).toBeDefined();
    const sortieLines = linesOf(sortie!);
    expect(Number(sortieLines["675"]?.debit)).toBe(400000);
    expect(Number(sortieLines["21"]?.credit)).toBe(400000);

    const encaissementLines = linesOf(encaissement!);
    expect(Number(encaissementLines["521"]?.debit)).toBe(100000);
    expect(Number(encaissementLines["775"]?.credit)).toBe(100000);
    // Moins-value = produit (775=100000) < charge (675=400000) -- pas d'assertion directe
    // sur le résultat net ici (calculé côté useFinancialStatements.ts, pas par la RPC),
    // seules les écritures postées relèvent de ce test d'intégration.
  });

  it("une mise au rebut (prix de cession nul) ne génère qu'une seule écriture, sans ligne 521/775", async () => {
    const acquisitionDate = new Date().toISOString().slice(0, 10);
    const asset = await createTestAsset("rebut", acquisitionDate);

    const { error: disposeErr } = await comptable.rpc("dispose_fixed_asset", {
      p_asset_id: asset.id,
      p_disposal_date: acquisitionDate,
      p_disposal_price: 0,
    });
    expect(disposeErr).toBeNull();

    const { entries, sortie, encaissement } = await entriesForAsset(asset.name);
    expect(entries).toHaveLength(1);
    expect(sortie).toBeDefined();
    expect(encaissement).toBeUndefined();
    const sortieLines = linesOf(sortie!);
    expect(Number(sortieLines["675"]?.debit)).toBe(400000);
    expect(Number(sortieLines["21"]?.credit)).toBe(400000);
    expect(sortieLines["521"]).toBeUndefined();
    expect(sortieLines["775"]).toBeUndefined();
  });
});
