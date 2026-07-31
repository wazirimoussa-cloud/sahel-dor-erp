import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

// Ce test exerce la vraie chaîne métier (achat -> réception -> vente -> validation ->
// paiement) contre le projet Supabase de Formation, exactement comme le fait
// l'application : RPC + RLS + attributions, aucun mock. C'est la seule façon de
// vérifier que les triggers et fonctions PL/pgSQL (calcul du prix de revient,
// consommation FEFO, séparation des tâches) fonctionnent réellement -- un test qui
// mockerait Supabase ne testerait que le code React, pas la logique métier qui vit
// en base.
//
// Nécessite les comptes provisoires Formation (voir README, "Comptes provisoires") et
// leurs mots de passe dans l'environnement -- voir .env.example. Le test est ignoré
// (pas en échec) si ces variables sont absentes, pour ne jamais bloquer `npm test` en
// local sans configuration ni exiger un secret réseau pour le reste de la suite.
//
// Aucune donnée créée ici n'est supprimée : les tables métier sont append-only par
// conception (voir README, "Limites connues"). Chaque exécution laisse un fournisseur,
// un client et un produit taggués "Intégration <horodatage>" dans Formation -- c'est
// l'environnement prévu pour ça (déjà rempli de données "QA Test" similaires).

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

describe.skipIf(!hasCredentials)("chaîne achat -> vente -> paiement (Formation, réel)", () => {
  let gerant: SupabaseClient<Database>;
  let magasinier: SupabaseClient<Database>;
  let superviseur: SupabaseClient<Database>;
  let comptable: SupabaseClient<Database>;

  let companyId: string;
  let warehouseId: string;
  let supplierId: string;
  let clientId: string;
  let productId: string;
  const unitPrice = 5000;

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
      .limit(1)
      .single();
    if (warehouseErr || !warehouse) {
      throw new Error(`Aucun magasin disponible pour le test : ${warehouseErr?.message}`);
    }
    warehouseId = warehouse.id;

    const tag = `Intégration ${new Date().toISOString()}`;

    const { data: supplier, error: supplierErr } = await gerant
      .from("suppliers")
      .insert({ company_id: companyId, name: `Fournisseur ${tag}` })
      .select("id")
      .single();
    if (supplierErr || !supplier) throw new Error(`Création fournisseur échouée : ${supplierErr?.message}`);
    supplierId = supplier.id;

    const { data: client, error: clientErr } = await gerant
      .from("clients")
      .insert({ company_id: companyId, name: `Client ${tag}` })
      .select("id")
      .single();
    if (clientErr || !client) throw new Error(`Création client échouée : ${clientErr?.message}`);
    clientId = client.id;

    const { data: product, error: productErr } = await gerant
      .from("products")
      .insert({
        company_id: companyId,
        name: `Produit ${tag}`,
        price: unitPrice,
        stock: 0,
        unit: "unité",
        vat_exempt: false,
      })
      .select("id")
      .single();
    if (productErr || !product) throw new Error(`Création produit échouée : ${productErr?.message}`);
    productId = product.id;
  });

  afterAll(async () => {
    await Promise.all([
      gerant?.auth.signOut(),
      magasinier?.auth.signOut(),
      superviseur?.auth.signOut(),
      comptable?.auth.signOut(),
    ]);
  });

  it("exécute la chaîne complète et calcule correctement coût de revient, stock et paiement", async () => {
    // 1. Le Gérant crée l'achat avec les frais de transport/manutention (saisis à la
    //    création depuis le 30/07/2026 -- voir README point 38).
    const { data: purchase, error: purchaseErr } = await gerant.rpc("create_purchase", {
      payload: {
        supplier_id: supplierId,
        warehouse_id: warehouseId,
        items: [{ product_id: productId, quantity: 10, unit_cost: 1000 }],
        freight_cost: 500,
        handling_cost: 300,
      },
    });
    expect(purchaseErr).toBeNull();
    expect(purchase?.status).toBe("pending");
    expect(Number(purchase?.freight_cost)).toBe(500);
    expect(Number(purchase?.handling_cost)).toBe(300);

    // 2. Le Magasinier réceptionne -- il ne saisit plus les frais, seulement les
    //    informations de livraison.
    const { data: received, error: receiveErr } = await magasinier.rpc("receive_purchase", {
      purchase_id: purchase!.id,
      losses: [],
      lot_expiry_dates: [],
      p_driver_name: "Chauffeur Test",
      p_truck_plate: "TEST-INTEGRATION",
      p_driver_phone: "90000000",
    });
    expect(receiveErr).toBeNull();
    expect(received?.status).toBe("received");

    // 3. Le prix de revient doit être achat + quote-part frais au prorata de la
    //    quantité : 1000 + (500 + 300) / 10 = 1080.
    const { data: lot, error: lotErr } = await magasinier
      .from("stock_lots")
      .select("quantity_remaining, unit_cost")
      .eq("product_id", productId)
      .eq("warehouse_id", warehouseId)
      .single();
    expect(lotErr).toBeNull();
    expect(Number(lot?.quantity_remaining)).toBe(10);
    expect(Number(lot?.unit_cost)).toBeCloseTo(1080, 2);

    // 4. Le Gérant crée la commande client (prix repris depuis products.price au
    //    moment de la création -- 5000 tel que défini par le produit de test).
    const { data: order, error: orderErr } = await gerant.rpc("create_order", {
      payload: {
        warehouse_id: warehouseId,
        client_id: clientId,
        items: [{ product_id: productId, quantity: 4 }],
      },
    });
    expect(orderErr).toBeNull();
    expect(order?.status).toBe("pending");

    // 5. Le Superviseur valide -- c'est cette étape, et elle seule, qui sort le stock.
    const { data: validated, error: validateErr } = await superviseur.rpc("validate_order", {
      order_id: order!.id,
    });
    expect(validateErr).toBeNull();
    expect(validated?.status).toBe("validated");

    const { data: lotAfterSale, error: lotAfterSaleErr } = await gerant
      .from("stock_lots")
      .select("quantity_remaining")
      .eq("product_id", productId)
      .eq("warehouse_id", warehouseId)
      .single();
    expect(lotAfterSaleErr).toBeNull();
    expect(Number(lotAfterSale?.quantity_remaining)).toBe(6);

    // 6. Le Comptable encaisse en deux fois : partiel puis solde. Le total TTC dépend
    //    du taux de TVA de la société, lu en direct plutôt que supposé.
    const { data: company, error: companyErr } = await comptable
      .from("companies")
      .select("vat_rate")
      .eq("id", companyId)
      .single();
    expect(companyErr).toBeNull();
    const vatRate = Number(company?.vat_rate ?? 0);
    const totalHt = unitPrice * 4;
    const totalTtc = Math.round((totalHt + (totalHt * vatRate) / 100) * 100) / 100;
    const firstInstallment = Math.round((totalTtc / 2) * 100) / 100;

    const { data: partial, error: partialErr } = await comptable.rpc("record_payment", {
      order_id: order!.id,
      amount: firstInstallment,
    });
    expect(partialErr).toBeNull();
    expect(partial?.payment_status).toBe("partial");
    expect(Number(partial?.amount_paid)).toBeCloseTo(firstInstallment, 2);

    const { data: paid, error: paidErr } = await comptable.rpc("record_payment", {
      order_id: order!.id,
      amount: totalTtc - firstInstallment,
    });
    expect(paidErr).toBeNull();
    expect(paid?.payment_status).toBe("paid");
    expect(Number(paid?.amount_paid)).toBeCloseTo(totalTtc, 2);

    // 7. Chaque étape doit avoir généré son écriture comptable automatiquement --
    //    aucune saisie manuelle n'existe dans l'app (voir README point 8).
    const { data: entries, error: entriesErr } = await comptable
      .from("journal_entries")
      .select("journal_code")
      .or(`purchase_id.eq.${purchase!.id},order_id.eq.${order!.id}`);
    expect(entriesErr).toBeNull();
    const journalCodes = (entries ?? []).map((e) => e.journal_code).sort();
    expect(journalCodes).toEqual(["ACHATS", "BANQUE", "BANQUE", "FRAIS", "VENTES"]);
  });

  it("refuse au Gérant la réception de son propre achat (séparation des tâches)", async () => {
    const { data: purchase, error: purchaseErr } = await gerant.rpc("create_purchase", {
      payload: {
        supplier_id: supplierId,
        warehouse_id: warehouseId,
        items: [{ product_id: productId, quantity: 1, unit_cost: 1000 }],
      },
    });
    expect(purchaseErr).toBeNull();

    const { error: receiveErr } = await gerant.rpc("receive_purchase", {
      purchase_id: purchase!.id,
      losses: [],
      lot_expiry_dates: [],
      p_driver_name: "N/A",
      p_truck_plate: "N/A",
      p_driver_phone: "N/A",
    });
    expect(receiveErr).not.toBeNull();
    expect(receiveErr?.message).toMatch(/non autorisé/i);
  });

  it("refuse au Gérant de valider sa propre commande (séparation des tâches)", async () => {
    const { data: order, error: orderErr } = await gerant.rpc("create_order", {
      payload: {
        warehouse_id: warehouseId,
        client_id: clientId,
        items: [{ product_id: productId, quantity: 1 }],
      },
    });
    expect(orderErr).toBeNull();

    const { error: validateErr } = await gerant.rpc("validate_order", { order_id: order!.id });
    expect(validateErr).not.toBeNull();
    expect(validateErr?.message).toMatch(/non autorisé/i);
  });
});
