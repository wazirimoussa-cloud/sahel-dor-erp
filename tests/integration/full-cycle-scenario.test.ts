import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { computeFinancialStatements } from "@/features/financials/useFinancialStatements";
import { computeVatDeclaration } from "@/features/financials/useVatDeclaration";
import type { FixedAssetRow } from "@/features/financials/useFixedAssets";

// Scénario bout en bout couvrant la chaîne complète achat -> réception (avec perte
// transporteur) -> mouvements/transfert de stock -> transformation (multi-extrants) ->
// production -> perte de stock ciblée -> vente (paiement partiel puis solde) ->
// commande annulée -> immobilisation (acquisition + cession) -> paie (bulletin +
// avance remboursée) -> déclaration TVA -> bilan/compte de résultat, contre Formation
// (RPC + RLS + attributions réelles, zéro mock). Objectif explicite de l'utilisateur :
// produire des données exploitables pour évaluer l'ensemble de la chaîne, pas seulement
// vérifier un comportement isolé -- le bilan/compte de résultat final est calculé avec
// les MÊMES fonctions pures que l'app (computeFinancialStatements/computeVatDeclaration,
// déjà testées unitairement) et imprimé en clair pour relecture humaine.
//
// Nécessite les comptes provisoires Formation -- voir .env.example. Suite ignorée
// (jamais en échec) si les identifiants sont absents. Aucune donnée créée ici n'est
// supprimée (tables append-only par conception) -- Formation est l'environnement prévu
// pour ça.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

const CREDENTIALS = {
  gerant: { email: process.env.TEST_GERANT_EMAIL, password: process.env.TEST_GERANT_PASSWORD },
  magasinier: { email: process.env.TEST_MAGASINIER_EMAIL, password: process.env.TEST_MAGASINIER_PASSWORD },
  superviseur: { email: process.env.TEST_SUPERVISEUR_EMAIL, password: process.env.TEST_SUPERVISEUR_PASSWORD },
  comptable: { email: process.env.TEST_COMPTABLE_EMAIL, password: process.env.TEST_COMPTABLE_PASSWORD },
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
  const { error } = await client.auth.signInWithPassword({ email: email as string, password: password as string });
  if (error) throw new Error(`Connexion échouée pour le profil ${role} (${email}) : ${error.message}`);
  return client;
}

function monthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function fcfa(n: number): string {
  return `${Math.round(n).toLocaleString("fr-FR")} FCFA`;
}

describe.skipIf(!hasCredentials)("scénario complet achat -> bilan (Formation, réel)", () => {
  let gerant: SupabaseClient<Database>;
  let magasinier: SupabaseClient<Database>;
  let superviseur: SupabaseClient<Database>;
  let comptable: SupabaseClient<Database>;

  let companyId: string;
  let warehouseId: string;
  let warehouseId2: string;
  const tag = `Scénario complet ${new Date().toISOString()}`;

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
    if (warehouseErr || !warehouse) throw new Error(`Aucun magasin actif disponible : ${warehouseErr?.message}`);
    warehouseId = warehouse.id;

    const { data: warehouse2, error: warehouse2Err } = await magasinier
      .from("warehouses")
      .insert({ company_id: companyId, name: `Magasin secondaire ${tag}` })
      .select("id")
      .single();
    if (warehouse2Err || !warehouse2) throw new Error(`Création du second magasin échouée : ${warehouse2Err?.message}`);
    warehouseId2 = warehouse2.id;
  });

  afterAll(async () => {
    await Promise.all([
      gerant?.auth.signOut(),
      magasinier?.auth.signOut(),
      superviseur?.auth.signOut(),
      comptable?.auth.signOut(),
    ]);
  });

  it("exécute la chaîne complète et imprime un bilan/compte de résultat exploitable", async () => {
    // --- 0. Fixtures : fournisseur, client, transporteur, produits ---------------------

    const { data: supplier, error: supplierErr } = await gerant
      .from("suppliers")
      .insert({ company_id: companyId, name: `Fournisseur ${tag}` })
      .select("id")
      .single();
    expect(supplierErr).toBeNull();

    const { data: client, error: clientErr } = await gerant
      .from("clients")
      .insert({ company_id: companyId, name: `Client ${tag}` })
      .select("id")
      .single();
    expect(clientErr).toBeNull();

    const { data: transporter, error: transporterErr } = await magasinier
      .from("transporters")
      .insert({ company_id: companyId, name: `Transporteur ${tag}` })
      .select("id")
      .single();
    expect(transporterErr).toBeNull();

    const productPayloads = [
      { name: `Arachide brute ${tag}`, price: 90000, unit: "tonne" as const },
      { name: `Huile d'arachide ${tag}`, price: 8000, unit: "bidon" as const },
      { name: `Tourteau d'arachide ${tag}`, price: 50000, unit: "tonne" as const },
      { name: `Sac de riz ${tag}`, price: 15000, unit: "unité" as const },
      { name: `Miel brut ${tag}`, price: 4000, unit: "unité" as const },
    ];
    const products: Record<string, string> = {};
    for (const p of productPayloads) {
      const { data, error } = await gerant
        .from("products")
        .insert({ company_id: companyId, name: p.name, price: p.price, stock: 0, unit: p.unit, vat_exempt: false })
        .select("id")
        .single();
      expect(error).toBeNull();
      products[p.name] = data!.id;
    }
    const arachide = products[`Arachide brute ${tag}`];
    const huile = products[`Huile d'arachide ${tag}`];
    const tourteau = products[`Tourteau d'arachide ${tag}`];
    const riz = products[`Sac de riz ${tag}`];
    const miel = products[`Miel brut ${tag}`];

    // --- 1. Achat multi-lignes avec frais de transport/manutention ---------------------

    const { data: purchase, error: purchaseErr } = await gerant.rpc("create_purchase", {
      payload: {
        supplier_id: supplier!.id,
        warehouse_id: warehouseId,
        items: [
          { product_id: arachide, quantity: 50, unit_cost: 90000 },
          { product_id: riz, quantity: 30, unit_cost: 12000 },
        ],
        freight_cost: 50000,
        handling_cost: 20000,
      },
    });
    expect(purchaseErr).toBeNull();
    expect(purchase?.status).toBe("pending");

    // --- 2. Réception avec une perte transporteur partielle sur l'arachide -------------

    const { data: received, error: receiveErr } = await magasinier.rpc("receive_purchase", {
      purchase_id: purchase!.id,
      losses: [{ product_id: arachide, transporter_id: transporter!.id, quantity_lost: 2, reason: "Sacs éventrés au transport" }],
      lot_expiry_dates: [],
      p_driver_name: "Chauffeur Scénario",
      p_truck_plate: "SC-001",
      p_driver_phone: "90000000",
    });
    expect(receiveErr).toBeNull();
    expect(received?.status).toBe("received");

    // --- 3. Mouvement manuel de stock (casse constatée en magasin) ---------------------

    const { error: adjustmentErr } = await magasinier.from("transactions").insert({
      product_id: riz,
      type: "ADJUSTMENT",
      quantity: -1,
      warehouse_id: warehouseId,
      user_id: (await magasinier.auth.getUser()).data.user!.id,
      note: `Casse manutention ${tag}`,
    });
    expect(adjustmentErr).toBeNull();

    // --- 4. Transfert entre magasins ----------------------------------------------------

    const { error: transferErr } = await magasinier.rpc("transfer_stock", {
      p_product_id: arachide,
      p_from_warehouse_id: warehouseId,
      p_to_warehouse_id: warehouseId2,
      p_quantity: 5,
    });
    expect(transferErr).toBeNull();

    // --- 5. Transformation multi-extrants (arachide -> huile + tourteau) ---------------

    const { data: transformation, error: transformationErr } = await gerant.rpc("create_transformation", {
      payload: {
        warehouse_id: warehouseId,
        inputs: [{ product_id: arachide, quantity: 20 }],
        outputs: [
          { product_id: huile, quantity: 15 },
          { product_id: tourteau, quantity: 10 },
        ],
      },
    });
    expect(transformationErr).toBeNull();

    // --- 6. Production (récolte brute) --------------------------------------------------

    const { data: production, error: productionErr } = await gerant.rpc("create_production", {
      payload: { warehouse_id: warehouseId, items: [{ product_id: miel, quantity: 40, unit_cost: 2500 }] },
    });
    expect(productionErr).toBeNull();

    // --- 7. Perte de stock ciblant un lot précis, déclarée puis approuvée --------------

    const { data: huileLot, error: huileLotErr } = await gerant
      .from("stock_lots")
      .select("id")
      .eq("product_id", huile)
      .eq("warehouse_id", warehouseId)
      .single();
    expect(huileLotErr).toBeNull();

    const { data: lossRequest, error: lossErr } = await magasinier.rpc("request_stock_loss", {
      p_product_id: huile,
      p_warehouse_id: warehouseId,
      p_quantity: 1,
      p_reason: `Bidon percé ${tag}`,
      p_lot_id: huileLot!.id,
    });
    expect(lossErr).toBeNull();

    const { error: approveErr } = await superviseur.rpc("approve_stock_loss", { p_request_id: lossRequest!.id });
    expect(approveErr).toBeNull();

    // --- 8. Vente : commande, validation, paiement en deux fois ------------------------

    const { data: order, error: orderErr } = await gerant.rpc("create_order", {
      payload: {
        warehouse_id: warehouseId,
        client_id: client!.id,
        items: [
          { product_id: huile, quantity: 8 },
          { product_id: riz, quantity: 10 },
        ],
      },
    });
    expect(orderErr).toBeNull();

    const { error: validateErr } = await superviseur.rpc("validate_order", { order_id: order!.id });
    expect(validateErr).toBeNull();

    const { data: company, error: companyErr } = await comptable
      .from("companies")
      .select("vat_rate, capital_social")
      .eq("id", companyId)
      .single();
    expect(companyErr).toBeNull();
    const vatRate = Number(company?.vat_rate ?? 0);
    const totalHt = 8 * 8000 + 10 * 15000;
    const totalTtc = Math.round((totalHt + (totalHt * vatRate) / 100) * 100) / 100;
    const firstInstallment = Math.round((totalTtc / 2) * 100) / 100;

    const { error: partialErr } = await comptable.rpc("record_payment", { order_id: order!.id, amount: firstInstallment });
    expect(partialErr).toBeNull();
    const { data: paidOrder, error: paidErr } = await comptable.rpc("record_payment", {
      order_id: order!.id,
      amount: totalTtc - firstInstallment,
    });
    expect(paidErr).toBeNull();
    expect(paidOrder?.payment_status).toBe("paid");

    // --- 9. Une seconde commande, créée puis annulée en attente ------------------------

    const { data: order2, error: order2Err } = await gerant.rpc("create_order", {
      payload: { warehouse_id: warehouseId, client_id: client!.id, items: [{ product_id: riz, quantity: 1 }] },
    });
    expect(order2Err).toBeNull();
    const { error: cancelErr } = await gerant.rpc("cancel_order", { order_id: order2!.id });
    expect(cancelErr).toBeNull();

    // --- 10. Immobilisation : acquisition puis cession en plus-value -------------------

    const { data: asset, error: assetErr } = await comptable.rpc("create_fixed_asset", {
      p_name: `Camion de livraison ${tag}`,
      p_category: "Véhicule",
      p_acquisition_date: monthsAgo(6),
      p_acquisition_cost: 4_000_000,
      p_useful_life_years: 5,
      p_depreciation_method: "lineaire",
      p_degressif_coefficient: null,
    });
    expect(assetErr).toBeNull();

    const { error: disposeErr } = await comptable.rpc("dispose_fixed_asset", {
      p_asset_id: asset!.id,
      p_disposal_date: today(),
      p_disposal_price: 3_900_000,
    });
    expect(disposeErr).toBeNull();

    // --- 11. Paie : employé, bulletin avec retenues, avance remboursée -----------------

    const { data: employee, error: employeeErr } = await comptable
      .from("employees")
      .insert({ company_id: companyId, full_name: `Employé ${tag}`, base_salary: 250000, family_dependents: 2 })
      .select("id")
      .single();
    expect(employeeErr).toBeNull();

    const { data: advance, error: advanceErr } = await comptable.rpc("create_salary_advance", {
      payload: { employee_id: employee!.id, amount: 30000, reason: `Avance ${tag}` },
    });
    expect(advanceErr).toBeNull();

    const { data: payslip, error: payslipErr } = await comptable.rpc("create_payslip", {
      payload: {
        employee_id: employee!.id,
        period: `${today().slice(0, 7)}-01`,
        gross_salary: 250000,
        pension_withholding: 12500,
        its_withholding: 15000,
        advance_repaid_id: advance!.id,
      },
    });
    expect(payslipErr).toBeNull();

    // --- 12. Déclaration TVA et bilan/compte de résultat, avec les fonctions de l'app --

    const startDate = monthsAgo(7); // couvre l'acquisition de l'immobilisation (6 mois).
    const endDate = today();
    const endBound = `${endDate}T23:59:59.999`;

    const [productsRes, purchaseLotsRes, transactionsRes, journalRes, fixedAssetsRes] = await Promise.all([
      comptable.from("products").select("id, name, unit"),
      comptable
        .from("stock_lots")
        .select(
          "product_id, quantity_received, unit_cost, transactions!stock_lots_source_transaction_id_fkey!inner(purchase_id)",
        )
        .not("transactions.purchase_id", "is", null),
      comptable.from("transactions").select("product_id, type, quantity, created_at").lte("created_at", endBound),
      comptable.from("journal_entries").select("entry_date, journal_entry_lines(debit, credit, chart_of_accounts(code))"),
      comptable
        .from("fixed_assets")
        .select(
          "id, name, category, acquisition_date, acquisition_cost, useful_life_years, disposal_date, depreciation_method, degressif_coefficient",
        ),
    ]);
    expect(productsRes.error).toBeNull();
    expect(purchaseLotsRes.error).toBeNull();
    expect(transactionsRes.error).toBeNull();
    expect(journalRes.error).toBeNull();
    expect(fixedAssetsRes.error).toBeNull();

    const statements = computeFinancialStatements({
      startDate,
      endDate,
      products: productsRes.data ?? [],
      purchaseLots: purchaseLotsRes.data ?? [],
      transactions: transactionsRes.data ?? [],
      journalEntries: journalRes.data ?? [],
      capitalSocial: Number(company?.capital_social ?? 0),
      fixedAssets: (fixedAssetsRes.data ?? []) as FixedAssetRow[],
    });

    const declaration = computeVatDeclaration(journalRes.data ?? [], vatRate);

    // Sanity check : le bilan calculé par l'app doit toujours s'équilibrer (garanti par
    // construction, mais vérifié ici sur de vraies données plutôt que des fixtures).
    expect(statements.balanceSheet.totalActif).toBeCloseTo(statements.balanceSheet.totalPassif, 2);

    // --- 13. Résumé imprimé pour relecture humaine --------------------------------------

    console.log(`
=== Scénario complet "${tag}" — résumé exploitable ===
Société : ${companyId}
Période analysée : ${startDate} → ${endDate}

--- Compte de résultat (période) ---
Produits (ventes)               : ${fcfa(statements.incomeStatement.produits)}
Charges (achats)                : ${fcfa(statements.incomeStatement.charges)}
Variation de stock               : ${fcfa(statements.incomeStatement.variationStock)}
Dotations aux amortissements     : ${fcfa(statements.incomeStatement.dotationsAmortissements)}
Résultat de cession d'immo.      : ${fcfa(statements.incomeStatement.resultatCessionImmobilisations)}
Résultat net de la période       : ${fcfa(statements.incomeStatement.resultatNet)}

--- Bilan (cumulé au ${endDate}) ---
Actif
  Immobilisations nettes         : ${fcfa(statements.balanceSheet.actif.immobilisationsNettes)}
  Stock                          : ${fcfa(statements.balanceSheet.actif.stock)}
  Clients                        : ${fcfa(statements.balanceSheet.actif.clients)}
  Créance TVA                    : ${fcfa(statements.balanceSheet.actif.tvaCreance)}
  Trésorerie                     : ${fcfa(statements.balanceSheet.actif.tresorerie)}
  TOTAL ACTIF                    : ${fcfa(statements.balanceSheet.totalActif)}
Passif
  Fournisseurs                   : ${fcfa(statements.balanceSheet.passif.fournisseurs)}
  TVA à payer                    : ${fcfa(statements.balanceSheet.passif.tvaAPayer)}
  Capital social                 : ${fcfa(statements.balanceSheet.passif.capitalSocial)}
  Résultat cumulé                : ${fcfa(statements.balanceSheet.passif.resultatCumule)}
  TOTAL PASSIF                   : ${fcfa(statements.balanceSheet.totalPassif)}

--- Déclaration TVA (même période) ---
Chiffre d'affaires HT            : ${fcfa(declaration.chiffreAffairesHT)}
TVA collectée                    : ${fcfa(declaration.tvaCollectee)}
Achats HT                        : ${fcfa(declaration.achatsHT)}
TVA déductible                   : ${fcfa(declaration.tvaDeductible)}
TVA nette (${declaration.tvaNette >= 0 ? "à payer" : "crédit à reporter"})       : ${fcfa(Math.abs(declaration.tvaNette))}

--- Stock non valorisé ---
${statements.unvaluedStock.length === 0 ? "Aucun." : statements.unvaluedStock.map((u) => `  ${u.name} : ${u.quantity} ${u.unit}`).join("\n")}

--- Identifiants pour consultation dans l'app (Formation) ---
Achat        : ${purchase!.id}
Transformation : ${transformation!.id}
Production   : ${production!.id}
Commande #1 (payée)   : ${order!.id}
Commande #2 (annulée) : ${order2!.id}
Immobilisation (cédée) : ${asset!.id}
Employé      : ${employee!.id}
Bulletin     : ${payslip!.id}
===========================================================
`);
  });
});
