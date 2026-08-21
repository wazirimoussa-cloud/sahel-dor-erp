import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { CREDENTIALS, hasCredentials, signInAs } from "./helpers/auth";

// Vérifie 0051_production_journal_entry.sql contre Formation (RLS + attributions
// réelles, zéro mock) : une production génère désormais une écriture "production
// stockée" (débit 36, crédit 73) -- une transformation, elle, reste neutre (aucune
// écriture), traitement confirmé avec l'utilisateur (voir le plan de cette session).
// Sans ce test, rien ne détecterait une régression future sur ce point précis.
//
// Nécessite les comptes provisoires Formation -- voir .env.example. Suite ignorée
// (jamais en échec) si les identifiants sont absents.

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
        purchase_cost: 2000,
        selling_price: 2000,
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

  it(
    "une transformation génère une écriture TRANSFORMATION de reclassement " +
      "(débit 31 = crédit 601, débit 36 = crédit 31), sans valeur nouvelle reconnue (0071)",
    async () => {
      const { data: inputProduct } = await gerant
        .from("products")
        .insert({
          company_id: companyId,
          name: `Intrant ${tag}`,
          purchase_cost: 1000,
          selling_price: 1000,
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
          purchase_cost: 1500,
          selling_price: 1500,
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

      // 5 unités consommées à 1000 FCFA/unité (coût du lot ci-dessus) = 5000 FCFA reclassés.
      const { data: transformation, error: transformationErr } = await gerant.rpc("create_transformation", {
        payload: {
          warehouse_id: warehouseId,
          inputs: [{ product_id: inputProduct!.id, quantity: 5 }],
          outputs: [{ product_id: outputProduct!.id, quantity: 3 }],
        },
      });
      expect(transformationErr).toBeNull();

      const { data: entries, error: entriesErr } = await comptable
        .from("journal_entries")
        .select("id, journal_code, journal_entry_lines(debit, credit, chart_of_accounts(code))")
        .eq("transformation_id", transformation!.id);
      expect(entriesErr).toBeNull();
      expect(entries).toHaveLength(1);
      expect(entries![0].journal_code).toBe("TRANSFORMATION");

      const lines = entries![0].journal_entry_lines as unknown as {
        debit: number;
        credit: number;
        chart_of_accounts: { code: string } | { code: string }[] | null;
      }[];
      expect(lines).toHaveLength(4);

      const codeOf = (line: (typeof lines)[number]) => {
        const coa = line.chart_of_accounts;
        return Array.isArray(coa) ? coa[0]?.code : coa?.code;
      };

      // Deux lignes sur le compte 31 (débit puis crédit du même montant, en passage) --
      // on les distingue par le sens plutôt que par position.
      const account31Debit = lines.find((l) => codeOf(l) === "31" && Number(l.debit) > 0);
      const account31Credit = lines.find((l) => codeOf(l) === "31" && Number(l.credit) > 0);
      const account601Credit = lines.find((l) => codeOf(l) === "601");
      const account36Debit = lines.find((l) => codeOf(l) === "36");

      expect(Number(account31Debit?.debit)).toBe(5000);
      expect(Number(account601Credit?.credit)).toBe(5000);
      expect(Number(account36Debit?.debit)).toBe(5000);
      expect(Number(account31Credit?.credit)).toBe(5000);

      // Aucune valeur nouvelle reconnue : contrairement à la Production (débit 36 =
      // crédit 73), aucune ligne ne touche le compte 73 ici.
      expect(lines.some((l) => codeOf(l) === "73")).toBe(false);
    },
  );

  // 0045_transformation_prix_revient.sql : le coût des intrants consommés est réparti
  // entre les extrants au prorata de leur VALEUR MARCHANDE (quantité × prix de vente
  // courant), pas de leur quantité -- jamais vérifié directement jusqu'ici (le test
  // ci-dessus ne porte que sur l'absence d'écriture comptable).
  it("répartit le coût des intrants entre extrants multiples au prorata de la valeur marchande, pas de la quantité", async () => {
    const { data: inputProduct, error: inputProductErr } = await gerant
      .from("products")
      .insert({
        company_id: companyId,
        name: `Intrant prorata ${tag}`,
        purchase_cost: 50,
        selling_price: 50,
        stock: 0,
        unit: "tonne",
        vat_exempt: false,
      })
      .select("id")
      .single();
    expect(inputProductErr, JSON.stringify(inputProductErr)).toBeNull();

    // Extrant A : prix élevé, faible quantité. Extrant B : prix faible, forte quantité.
    // Valeur marchande : A = 3 × 1000 = 3000 ; B = 4 × 500 = 2000 -- un prorata par
    // quantité donnerait 3/7 ≈ 43% à A, alors qu'un prorata par valeur donne 60%.
    const { data: outputA } = await gerant
      .from("products")
      .insert({
        company_id: companyId,
        name: `Extrant A ${tag}`,
        purchase_cost: 1000,
        selling_price: 1000,
        stock: 0,
        unit: "bidon",
        vat_exempt: false,
      })
      .select("id")
      .single();
    const { data: outputB } = await gerant
      .from("products")
      .insert({
        company_id: companyId,
        name: `Extrant B ${tag}`,
        purchase_cost: 500,
        selling_price: 500,
        stock: 0,
        unit: "tonne",
        vat_exempt: false,
      })
      .select("id")
      .single();

    // Stock d'intrant à coût connu et entièrement consommé par la transformation :
    // 10 kg à 100 FCFA/kg = 1000 FCFA de coût total à répartir.
    await gerant.rpc("create_production", {
      payload: {
        warehouse_id: warehouseId,
        items: [{ product_id: inputProduct!.id, quantity: 10, unit_cost: 100 }],
      },
    });

    const { data: transformation, error: transformationErr } = await gerant.rpc("create_transformation", {
      payload: {
        warehouse_id: warehouseId,
        inputs: [{ product_id: inputProduct!.id, quantity: 10 }],
        outputs: [
          { product_id: outputA!.id, quantity: 3 },
          { product_id: outputB!.id, quantity: 4 },
        ],
      },
    });
    expect(transformationErr).toBeNull();

    const { data: outputs, error: outputsErr } = await gerant
      .from("transformation_outputs")
      .select("product_id, unit_cost")
      .eq("transformation_id", transformation!.id);
    expect(outputsErr).toBeNull();

    const unitCostOf = (productId: string) =>
      Number(outputs!.find((o) => o.product_id === productId)!.unit_cost);

    // unit_cost = total_intrant_cost × prix_extrant / valeur_marchande_totale.
    expect(unitCostOf(outputA!.id)).toBeCloseTo((1000 * 1000) / 5000, 6); // 200
    expect(unitCostOf(outputB!.id)).toBeCloseTo((1000 * 500) / 5000, 6); // 100

    // Le coût total réparti doit reconstituer exactement le coût des intrants consommés.
    const totalAllocated = unitCostOf(outputA!.id) * 3 + unitCostOf(outputB!.id) * 4;
    expect(totalAllocated).toBeCloseTo(1000, 6);
  });

  it("un extrant unique reçoit l'intégralité du coût des intrants, quel que soit son prix de vente", async () => {
    const { data: inputProduct } = await gerant
      .from("products")
      .insert({
        company_id: companyId,
        name: `Intrant unique ${tag}`,
        purchase_cost: 50,
        selling_price: 50,
        stock: 0,
        unit: "tonne",
        vat_exempt: false,
      })
      .select("id")
      .single();
    const { data: outputProduct } = await gerant
      .from("products")
      .insert({
        company_id: companyId,
        name: `Extrant unique ${tag}`,
        purchase_cost: 99999, // prix arbitraire, sans effet sur le résultat avec un seul extrant.
        selling_price: 99999,
        stock: 0,
        unit: "bidon",
        vat_exempt: false,
      })
      .select("id")
      .single();

    await gerant.rpc("create_production", {
      payload: {
        warehouse_id: warehouseId,
        items: [{ product_id: inputProduct!.id, quantity: 8, unit_cost: 250 }],
      },
    });

    const { data: transformation, error: transformationErr } = await gerant.rpc("create_transformation", {
      payload: {
        warehouse_id: warehouseId,
        inputs: [{ product_id: inputProduct!.id, quantity: 8 }],
        outputs: [{ product_id: outputProduct!.id, quantity: 2 }],
      },
    });
    expect(transformationErr).toBeNull();

    const { data: output } = await gerant
      .from("transformation_outputs")
      .select("unit_cost")
      .eq("transformation_id", transformation!.id)
      .single();

    // 8 kg × 250 = 2000 FCFA de coût, réparti sur 2 unités = 1000/unité -- le prix de
    // vente (99999) n'intervient nulle part puisqu'il représente 100% de la valeur.
    expect(Number(output?.unit_cost)).toBeCloseTo(1000, 6);
  });

  it("si tous les extrants ont un prix de vente nul, le coût de repli est 0 (pas de division par zéro)", async () => {
    const { data: inputProduct } = await gerant
      .from("products")
      .insert({
        company_id: companyId,
        name: `Intrant prix nul ${tag}`,
        purchase_cost: 50,
        selling_price: 50,
        stock: 0,
        unit: "tonne",
        vat_exempt: false,
      })
      .select("id")
      .single();
    const { data: outputProduct } = await gerant
      .from("products")
      .insert({
        company_id: companyId,
        name: `Extrant prix nul ${tag}`,
        purchase_cost: 0,
        selling_price: 0,
        stock: 0,
        unit: "tonne",
        vat_exempt: false,
      })
      .select("id")
      .single();

    await gerant.rpc("create_production", {
      payload: {
        warehouse_id: warehouseId,
        items: [{ product_id: inputProduct!.id, quantity: 5, unit_cost: 400 }],
      },
    });

    const { data: transformation, error: transformationErr } = await gerant.rpc("create_transformation", {
      payload: {
        warehouse_id: warehouseId,
        inputs: [{ product_id: inputProduct!.id, quantity: 5 }],
        outputs: [{ product_id: outputProduct!.id, quantity: 3 }],
      },
    });
    expect(transformationErr).toBeNull();

    const { data: output } = await gerant
      .from("transformation_outputs")
      .select("unit_cost")
      .eq("transformation_id", transformation!.id)
      .single();

    expect(Number(output?.unit_cost)).toBe(0);
    expect(Number.isNaN(Number(output?.unit_cost))).toBe(false);
  });
});
