import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { CREDENTIALS, hasCredentials, signInAs } from "./helpers/auth";

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
  let productUnitCost: number;
  const unitPrice = 5000;

  beforeAll(async () => {
    gerant = await signInAs("gerant");
    magasinier = await signInAs("magasinier");
    superviseur = await signInAs("superviseur");
    comptable = await signInAs("comptable");

    const { data: gerantRow, error: gerantErr } = await gerant
      .from("users")
      .select("company_id")
      .eq("login", CREDENTIALS.gerant.login as string)
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

    // purchase_cost/frais/stock choisis pour un prix de revient rond et connu à
    // l'avance : (700 + 200 + 100) / 10 = 100 -- vérifié figé au moment de la
    // réception d'un achat, quel que soit le coût saisi sur cet achat (0075/0076).
    const { data: product, error: productErr } = await gerant
      .from("products")
      .insert({
        company_id: companyId,
        name: `Produit ${tag}`,
        purchase_cost: 700,
        freight_cost: 200,
        handling_cost: 100,
        selling_price: unitPrice,
        stock: 10,
        unit: "unité",
        vat_exempt: false,
      })
      .select("id")
      .single();
    if (productErr || !product) throw new Error(`Création produit échouée : ${productErr?.message}`);
    productId = product.id;
    productUnitCost = 100;
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
    // 1. Le Gérant crée l'achat. Plus de frais de transport/manutention saisis ici
    //    depuis 0076 -- seul le coût de la ligne (purchase_items.unit_cost, sert à
    //    l'écriture 601) reste saisi à l'achat ; il n'influence plus la valorisation
    //    du stock (voir étape 3).
    const { data: purchase, error: purchaseErr } = await gerant.rpc("create_purchase", {
      payload: {
        supplier_id: supplierId,
        warehouse_id: warehouseId,
        items: [{ product_id: productId, quantity: 10, unit_cost: 1000 }],
      },
    });
    expect(purchaseErr).toBeNull();
    expect(purchase?.status).toBe("pending");

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

    // 3. Le prix de revient du lot reçu est le coût FIXE du produit (products.unit_cost
    //    = 100, voir beforeAll), pas le coût de la ligne d'achat (1000 ci-dessus) --
    //    0075/0076 remplacent le calcul par achat par un prix de revient figé à la
    //    création du produit. Le test dédié à cette indépendance est plus bas ("le lot
    //    reçu reprend le prix de revient fixé à la création du produit...").
    const { data: lot, error: lotErr } = await magasinier
      .from("stock_lots")
      .select("quantity_remaining, unit_cost")
      .eq("product_id", productId)
      .eq("warehouse_id", warehouseId)
      .single();
    expect(lotErr).toBeNull();
    expect(Number(lot?.quantity_remaining)).toBe(10);
    expect(Number(lot?.unit_cost)).toBeCloseTo(productUnitCost, 2);

    // 4. Le Gérant crée la commande client (prix repris depuis products.selling_price
    //    au moment de la création -- 5000 tel que défini par le produit de test).
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
    expect(journalCodes).toEqual(["ACHATS", "BANQUE", "BANQUE", "VENTES"]);
  });

  it("le lot reçu reprend le prix de revient fixé à la création du produit, pas un recalcul par achat (0075/0076)", async () => {
    const tag = `Intégration prix de revient fixe ${new Date().toISOString()}`;

    // Deux produits à prix de revient connu et volontairement très différent du coût
    // qui sera saisi sur la ligne d'achat plus bas -- si le lot reçu prend malgré tout
    // ce prix de revient (et non le coût de la ligne), c'est la preuve que le calcul
    // par achat (ancien point 55/0068) n'existe plus.
    const { data: productA, error: productAErr } = await gerant
      .from("products")
      .insert({
        company_id: companyId,
        name: `${tag} A`,
        purchase_cost: 900,
        freight_cost: 100,
        handling_cost: 0,
        selling_price: 0,
        stock: 10,
        unit: "tonne",
        vat_exempt: false,
      })
      .select("id")
      .single();
    expect(productAErr).toBeNull(); // unit_cost = (900 + 100 + 0) / 10 = 100

    const { data: productB, error: productBErr } = await gerant
      .from("products")
      .insert({
        company_id: companyId,
        name: `${tag} B`,
        purchase_cost: 4000,
        freight_cost: 800,
        handling_cost: 200,
        selling_price: 0,
        stock: 5,
        unit: "unité",
        vat_exempt: false,
      })
      .select("id")
      .single();
    expect(productBErr).toBeNull(); // unit_cost = (4000 + 800 + 200) / 5 = 1000

    // Coûts de ligne délibérément sans rapport avec le prix de revient ci-dessus.
    const { data: purchase, error: purchaseErr } = await gerant.rpc("create_purchase", {
      payload: {
        supplier_id: supplierId,
        warehouse_id: warehouseId,
        items: [
          { product_id: productA!.id, quantity: 20, unit_cost: 1 },
          { product_id: productB!.id, quantity: 3, unit_cost: 1 },
        ],
      },
    });
    expect(purchaseErr).toBeNull();

    const { error: receiveErr } = await magasinier.rpc("receive_purchase", {
      purchase_id: purchase!.id,
      losses: [],
      lot_expiry_dates: [],
      p_driver_name: "Chauffeur Test",
      p_truck_plate: "TEST-INTEGRATION",
      p_driver_phone: "90000000",
    });
    expect(receiveErr).toBeNull();

    const { data: lotA } = await magasinier
      .from("stock_lots")
      .select("unit_cost")
      .eq("product_id", productA!.id)
      .eq("warehouse_id", warehouseId)
      .single();
    expect(Number(lotA?.unit_cost)).toBeCloseTo(100, 2);

    const { data: lotB } = await magasinier
      .from("stock_lots")
      .select("unit_cost")
      .eq("product_id", productB!.id)
      .eq("warehouse_id", warehouseId)
      .single();
    expect(Number(lotB?.unit_cost)).toBeCloseTo(1000, 2);
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

  it("refuse au Gérant l'annulation de son propre achat (0079)", async () => {
    const { data: purchase, error: purchaseErr } = await gerant.rpc("create_purchase", {
      payload: {
        supplier_id: supplierId,
        warehouse_id: warehouseId,
        items: [{ product_id: productId, quantity: 1, unit_cost: 1000 }],
      },
    });
    expect(purchaseErr).toBeNull();

    const { error: cancelErr } = await gerant.rpc("cancel_purchase", { purchase_id: purchase!.id });
    expect(cancelErr).not.toBeNull();
    expect(cancelErr?.message).toMatch(/propre achat/i);

    // La tentative refusée ne doit pas avoir fait bouger le statut.
    const { data: purchaseAfter } = await gerant
      .from("purchases")
      .select("status")
      .eq("id", purchase!.id)
      .single();
    expect(purchaseAfter?.status).toBe("pending");
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

  // cancel_order n'avait jusqu'ici aucun test : une commande en attente n'a encore
  // touché ni le stock ni la comptabilité (seule validate_order le fait), donc
  // l'annulation doit se limiter à un changement de statut, sans effet de bord.
  it("le Gérant peut annuler sa propre commande en attente, sans impact sur le stock", async () => {
    const { data: stockBefore } = await gerant
      .from("product_stocks")
      .select("stock")
      .eq("product_id", productId)
      .eq("warehouse_id", warehouseId)
      .single();

    const { data: order, error: orderErr } = await gerant.rpc("create_order", {
      payload: {
        warehouse_id: warehouseId,
        client_id: clientId,
        items: [{ product_id: productId, quantity: 1 }],
      },
    });
    expect(orderErr).toBeNull();
    expect(order?.status).toBe("pending");

    const { data: cancelled, error: cancelErr } = await gerant.rpc("cancel_order", {
      order_id: order!.id,
    });
    expect(cancelErr).toBeNull();
    expect(cancelled?.status).toBe("cancelled");

    const { data: stockAfter } = await gerant
      .from("product_stocks")
      .select("stock")
      .eq("product_id", productId)
      .eq("warehouse_id", warehouseId)
      .single();
    expect(Number(stockAfter?.stock)).toBe(Number(stockBefore?.stock));

    const { data: entries, error: entriesErr } = await gerant
      .from("journal_entries")
      .select("id")
      .eq("order_id", order!.id);
    expect(entriesErr).toBeNull();
    expect(entries).toHaveLength(0);
  });

  it("refuse d'annuler une commande déjà validée (une fois le stock sorti, l'annulation n'a plus de sens)", async () => {
    const { data: order, error: orderErr } = await gerant.rpc("create_order", {
      payload: {
        warehouse_id: warehouseId,
        client_id: clientId,
        items: [{ product_id: productId, quantity: 1 }],
      },
    });
    expect(orderErr).toBeNull();

    const { data: validated, error: validateErr } = await superviseur.rpc("validate_order", {
      order_id: order!.id,
    });
    expect(validateErr).toBeNull();
    expect(validated?.status).toBe("validated");

    const { error: cancelErr } = await gerant.rpc("cancel_order", { order_id: order!.id });
    expect(cancelErr).not.toBeNull();
    expect(cancelErr?.message).toMatch(/attente/i);

    // La tentative refusée ne doit pas avoir fait bouger le statut.
    const { data: orderAfter } = await gerant.from("orders").select("status").eq("id", order!.id).single();
    expect(orderAfter?.status).toBe("validated");
  });

  it("un Magasinier ne peut pas annuler une commande (droits insuffisants)", async () => {
    const { data: order, error: orderErr } = await gerant.rpc("create_order", {
      payload: {
        warehouse_id: warehouseId,
        client_id: clientId,
        items: [{ product_id: productId, quantity: 1 }],
      },
    });
    expect(orderErr).toBeNull();

    const { error: cancelErr } = await magasinier.rpc("cancel_order", { order_id: order!.id });
    expect(cancelErr).not.toBeNull();
    expect(cancelErr?.message).toMatch(/non autorisé/i);

    const { data: orderAfter } = await gerant.from("orders").select("status").eq("id", order!.id).single();
    expect(orderAfter?.status).toBe("pending");
  });
});
