import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { CREDENTIALS, hasCredentials, signInAs } from "./helpers/auth";

// Complète la couverture d'intégration sur les opérations à fort volume qui n'avaient
// encore aucune garde automatisée : mouvement manuel de stock, transfert entre
// magasins, pertes de stock (déclaration/approbation/rejet/reconditionnement) et
// immobilisations. Même approche que les autres fichiers de ce dossier : RPC/insertions
// réelles contre Formation (RLS + attributions, zéro mock).
//
// Nécessite les comptes provisoires Formation -- voir .env.example. Suite ignorée
// (jamais en échec) si les identifiants sont absents.

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
      purchase_cost: unitCost,
      selling_price: unitCost,
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

  // Ciblage d'un lot précis (0067_pertes_stock_lot_cible.sql) : la perte peut désigner
  // exactement quel lot est concerné, au lieu de toujours passer par le FEFO générique.
  it("une perte ciblant un lot précis consomme exactement ce lot, sans toucher l'autre lot du même produit", async () => {
    const productId = await seedStock(gerant, companyId, warehouseId, `${tag} G`, 5, 1000);

    // Deuxième lot du même produit/magasin (péremption inconnue comme le premier --
    // sans le ciblage, le FEFO générique consommerait le premier lot créé en premier).
    const { error: secondProductionErr } = await gerant.rpc("create_production", {
      payload: {
        warehouse_id: warehouseId,
        items: [{ product_id: productId, quantity: 5, unit_cost: 1500 }],
      },
    });
    expect(secondProductionErr).toBeNull();

    const { data: lots, error: lotsErr } = await gerant
      .from("stock_lots")
      .select("id, quantity_remaining")
      .eq("product_id", productId)
      .eq("warehouse_id", warehouseId)
      .order("created_at", { ascending: true });
    expect(lotsErr).toBeNull();
    expect(lots).toHaveLength(2);
    const [lotA, lotB] = lots!;

    const { data: request, error: requestErr } = await magasinier.rpc("request_stock_loss", {
      p_product_id: productId,
      p_warehouse_id: warehouseId,
      p_quantity: 3,
      p_reason: "Perte ciblée sur le second lot -- test intégration",
      p_lot_id: lotB.id,
    });
    expect(requestErr).toBeNull();

    const { error: approveErr } = await superviseur.rpc("approve_stock_loss", {
      p_request_id: request!.id,
    });
    expect(approveErr).toBeNull();

    const { data: refreshedLotA } = await magasinier
      .from("stock_lots")
      .select("quantity_remaining")
      .eq("id", lotA.id)
      .single();
    expect(Number(refreshedLotA?.quantity_remaining)).toBe(Number(lotA.quantity_remaining));

    const { data: refreshedLotB } = await magasinier
      .from("stock_lots")
      .select("quantity_remaining")
      .eq("id", lotB.id)
      .single();
    expect(Number(refreshedLotB?.quantity_remaining)).toBe(Number(lotB.quantity_remaining) - 3);
  });

  it("un lot ciblé insuffisant fait échouer l'approbation sans effet de bord (rollback atomique)", async () => {
    // Le lot ciblé (5 unités) est insuffisant pour la quantité demandée (10), mais le
    // stock TOTAL du produit (5 + 20 = 25, deux lots) suffirait très largement -- ça
    // isole bien l'échec sur "ce lot précis n'a pas assez", pas sur le stock global
    // (qui déclencherait plus tôt la contrainte products_stock_check, un cas différent).
    const productId = await seedStock(gerant, companyId, warehouseId, `${tag} H`, 5, 1000);
    const { error: secondProductionErr } = await gerant.rpc("create_production", {
      payload: {
        warehouse_id: warehouseId,
        items: [{ product_id: productId, quantity: 20, unit_cost: 1000 }],
      },
    });
    expect(secondProductionErr).toBeNull();

    const { data: lot } = await gerant
      .from("stock_lots")
      .select("id, quantity_remaining")
      .eq("product_id", productId)
      .eq("warehouse_id", warehouseId)
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    const { data: request, error: requestErr } = await magasinier.rpc("request_stock_loss", {
      p_product_id: productId,
      p_warehouse_id: warehouseId,
      p_quantity: 10,
      p_reason: "Quantité impossible sur ce lot précis -- test intégration",
      p_lot_id: lot!.id,
    });
    expect(requestErr).toBeNull();

    const { error: approveErr } = await superviseur.rpc("approve_stock_loss", {
      p_request_id: request!.id,
    });
    expect(approveErr).not.toBeNull();
    expect(approveErr?.message).toMatch(/insuffisant/i);

    const { data: refreshedRequest } = await superviseur
      .from("stock_loss_requests")
      .select("status")
      .eq("id", request!.id)
      .single();
    expect(refreshedRequest?.status).toBe("pending");

    const { data: refreshedLot } = await magasinier
      .from("stock_lots")
      .select("quantity_remaining")
      .eq("id", lot!.id)
      .single();
    expect(Number(refreshedLot?.quantity_remaining)).toBe(Number(lot!.quantity_remaining));

    const { data: stock } = await magasinier
      .from("product_stocks")
      .select("stock")
      .eq("product_id", productId)
      .eq("warehouse_id", warehouseId)
      .single();
    expect(Number(stock?.stock)).toBe(25);
  });

  it("cibler un lot d'un autre produit est refusé dès la déclaration", async () => {
    const productId = await seedStock(gerant, companyId, warehouseId, `${tag} I`, 5, 1000);
    const otherProductId = await seedStock(gerant, companyId, warehouseId, `${tag} J`, 5, 1000);

    const { data: otherLot } = await gerant
      .from("stock_lots")
      .select("id")
      .eq("product_id", otherProductId)
      .eq("warehouse_id", warehouseId)
      .single();

    const { error: requestErr } = await magasinier.rpc("request_stock_loss", {
      p_product_id: productId,
      p_warehouse_id: warehouseId,
      p_quantity: 2,
      p_reason: "Lot d'un autre produit -- test intégration",
      p_lot_id: otherLot!.id,
    });
    expect(requestErr).not.toBeNull();
    expect(requestErr?.message).toMatch(/lot ciblé/i);
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

  it("une cession d'immobilisation dégressive applique la formule exponentielle continue (prorata temporis, sans plafond)", async () => {
    const acquisitionCost = 400000;
    const usefulLifeYears = 4;
    const coefficient = 2;
    const acquisitionDate = new Date();
    // 18 mois avant aujourd'hui, pour avoir un elapsedYears non trivial (1.5 an).
    acquisitionDate.setMonth(acquisitionDate.getMonth() - 18);
    const acquisitionDateIso = acquisitionDate.toISOString().slice(0, 10);
    const disposalDateIso = new Date().toISOString().slice(0, 10);

    const { data: asset, error: createErr } = await comptable.rpc("create_fixed_asset", {
      p_name: `Immobilisation dégressive ${tag}`,
      p_category: "Matériel",
      p_acquisition_date: acquisitionDateIso,
      p_acquisition_cost: acquisitionCost,
      p_useful_life_years: usefulLifeYears,
      p_depreciation_method: "degressif",
      p_degressif_coefficient: coefficient,
    });
    expect(createErr).toBeNull();

    // Reproduit exactement accumulatedDepreciationAsOf() côté client (useFixedAssets.ts) :
    // aucun code partagé possible entre le test JS et le calcul PL/pgSQL, donc le test
    // recalcule la formule indépendamment pour vérifier la valeur postée par le serveur.
    const linearRate = 1 / usefulLifeYears;
    const effectiveRate = Math.min(coefficient * linearRate, 1);
    const elapsedYears = 18 / 12;
    const expectedVnc = acquisitionCost * Math.pow(1 - effectiveRate, elapsedYears);
    const expectedAmortissementCumule = acquisitionCost - expectedVnc;

    const { error: disposeErr } = await comptable.rpc("dispose_fixed_asset", {
      p_asset_id: asset!.id,
      p_disposal_date: disposalDateIso,
      p_disposal_price: 0,
    });
    expect(disposeErr).toBeNull();

    const { data: entries, error: entriesErr } = await comptable
      .from("journal_entries")
      .select("description, journal_entry_lines(debit, credit, chart_of_accounts(code))")
      .eq("company_id", companyId)
      .eq("journal_code", "IMMOBILISATIONS")
      .ilike("description", `Sortie Immobilisation dégressive ${tag}`);
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
    const line28 = lines.find((l) => codeOf(l) === "28");
    const line675 = lines.find((l) => codeOf(l) === "675");

    // toBeCloseTo à 2 décimales : le serveur arrondit en numeric(14,2), le calcul JS
    // attendu est en double précision -- une comparaison exacte flotterait de 1e-9.
    expect(Number(line28!.debit)).toBeCloseTo(expectedAmortissementCumule, 2);
    expect(Number(line675!.debit)).toBeCloseTo(expectedVnc, 2);
    expect(Number(line28!.debit) + Number(line675!.debit)).toBeCloseTo(acquisitionCost, 2);
  });

  it("un actif dégressif rejette une création sans coefficient, un actif linéaire ignore un coefficient renseigné", async () => {
    const { error: missingCoefficientErr } = await comptable.rpc("create_fixed_asset", {
      p_name: `Dégressif sans coefficient ${tag}`,
      p_category: "Matériel",
      p_acquisition_date: new Date().toISOString().slice(0, 10),
      p_acquisition_cost: 100000,
      p_useful_life_years: 3,
      p_depreciation_method: "degressif",
      p_degressif_coefficient: null,
    });
    expect(missingCoefficientErr).not.toBeNull();
    expect(missingCoefficientErr?.message).toMatch(/coefficient dégressif positif/i);

    // Un coefficient envoyé en linéaire est silencieusement ignoré (forcé à null par la
    // RPC), pas rejeté -- vérifie que l'insertion aboutit et que le coefficient stocké
    // est bien null, jamais la valeur envoyée par erreur.
    const { data: asset, error: ignoredCoefficientErr } = await comptable.rpc("create_fixed_asset", {
      p_name: `Linéaire avec coefficient ignoré ${tag}`,
      p_category: "Matériel",
      p_acquisition_date: new Date().toISOString().slice(0, 10),
      p_acquisition_cost: 100000,
      p_useful_life_years: 3,
      p_depreciation_method: "lineaire",
      p_degressif_coefficient: 2,
    });
    expect(ignoredCoefficientErr).toBeNull();

    const { data: stored } = await comptable
      .from("fixed_assets")
      .select("degressif_coefficient")
      .eq("id", asset!.id)
      .single();
    expect(stored?.degressif_coefficient).toBeNull();
  });
});
