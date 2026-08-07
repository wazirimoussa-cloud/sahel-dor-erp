import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { CREDENTIALS, hasCredentials, signInAs } from "./helpers/auth";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const DEFAULT_PASSWORD = "saheldor2026";

// Vérifie l'archivage (0048_archivage.sql) contre le vrai projet Supabase de Formation
// (RLS + attributions réelles, zéro mock) -- même approche que
// purchase-to-payment.test.ts, voir ce fichier pour le contexte général.
//
// Couvre spécifiquement deux bugs corrigés pendant cette phase : la policy
// users_admin_write (0049) et companies_admin_write (0050) ne vérifiaient que le rôle
// littéral 'admin', jamais migré vers les attributions -- ce qui les rendait
// structurellement inopérantes pour tous les profils du modèle actuel (role_id est
// null). Les tests E/F/G ci-dessous sont des gardes de non-régression pour ces deux
// correctifs : sans eux, rien n'empêcherait une future migration de réintroduire le
// même défaut sans qu'aucun test ne le détecte.
//
// Le mot de passe par défaut ("saheldor2026", voir
// supabase/functions/_shared/constants.ts) est utilisé pour le compte jetable créé par
// le test E plutôt que de dépendre d'un compte existant dont le mot de passe a pu
// changer entre deux sessions de travail -- fragilité déjà rencontrée une fois sur les
// comptes gerant.formation/admin.formation pendant cette même phase.

describe.skipIf(!hasCredentials)("archivage (Formation, réel)", () => {
  let gerant: SupabaseClient<Database>;
  let magasinier: SupabaseClient<Database>;
  let comptable: SupabaseClient<Database>;
  let admin: SupabaseClient<Database>;

  let companyId: string;
  let warehouseId: string;
  const tag = `Intégration archivage ${new Date().toISOString()}`;

  beforeAll(async () => {
    gerant = await signInAs("gerant");
    magasinier = await signInAs("magasinier");
    comptable = await signInAs("comptable");
    admin = await signInAs("admin");

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
    await Promise.all([
      gerant?.auth.signOut(),
      magasinier?.auth.signOut(),
      comptable?.auth.signOut(),
      admin?.auth.signOut(),
    ]);
  });

  it("archive un produit empêche un nouvel achat et une nouvelle commande, réactiver le restaure", async () => {
    const { data: supplier } = await gerant
      .from("suppliers")
      .insert({ company_id: companyId, name: `Fournisseur ${tag} A` })
      .select("id")
      .single();
    const { data: client } = await gerant
      .from("clients")
      .insert({ company_id: companyId, name: `Client ${tag} A` })
      .select("id")
      .single();
    const { data: product } = await gerant
      .from("products")
      .insert({
        company_id: companyId,
        name: `Produit ${tag} A`,
        price: 1000,
        stock: 0,
        unit: "unité",
        vat_exempt: false,
      })
      .select("id")
      .single();

    // Archivage : produits_update est déjà gérée par produits.gerer_catalogue, que le
    // Gérant détient -- aucune policy dédiée n'était nécessaire pour ce cas.
    const { error: archiveErr } = await gerant.from("products").update({ active: false }).eq("id", product!.id);
    expect(archiveErr).toBeNull();

    const { error: purchaseErr } = await gerant.rpc("create_purchase", {
      payload: {
        supplier_id: supplier!.id,
        warehouse_id: warehouseId,
        items: [{ product_id: product!.id, quantity: 1, unit_cost: 1000 }],
      },
    });
    expect(purchaseErr?.message).toMatch(/archiv/i);

    const { error: orderErr } = await gerant.rpc("create_order", {
      payload: {
        warehouse_id: warehouseId,
        client_id: client!.id,
        items: [{ product_id: product!.id, quantity: 1 }],
      },
    });
    expect(orderErr?.message).toMatch(/archiv/i);

    await gerant.from("products").update({ active: true }).eq("id", product!.id);

    const { error: purchaseAfterReactivate } = await gerant.rpc("create_purchase", {
      payload: {
        supplier_id: supplier!.id,
        warehouse_id: warehouseId,
        items: [{ product_id: product!.id, quantity: 1, unit_cost: 1000 }],
      },
    });
    expect(purchaseAfterReactivate).toBeNull();
  });

  it("archive un fournisseur empêche un nouvel achat, réactiver le restaure", async () => {
    const { data: supplier } = await gerant
      .from("suppliers")
      .insert({ company_id: companyId, name: `Fournisseur ${tag} B` })
      .select("id")
      .single();
    const { data: product } = await gerant
      .from("products")
      .insert({
        company_id: companyId,
        name: `Produit ${tag} B`,
        price: 1000,
        stock: 0,
        unit: "unité",
        vat_exempt: false,
      })
      .select("id")
      .single();

    await gerant.from("suppliers").update({ active: false }).eq("id", supplier!.id);

    const { error: purchaseErr } = await gerant.rpc("create_purchase", {
      payload: {
        supplier_id: supplier!.id,
        warehouse_id: warehouseId,
        items: [{ product_id: product!.id, quantity: 1, unit_cost: 1000 }],
      },
    });
    expect(purchaseErr?.message).toMatch(/archiv/i);

    await gerant.from("suppliers").update({ active: true }).eq("id", supplier!.id);

    const { error: purchaseAfterReactivate } = await gerant.rpc("create_purchase", {
      payload: {
        supplier_id: supplier!.id,
        warehouse_id: warehouseId,
        items: [{ product_id: product!.id, quantity: 1, unit_cost: 1000 }],
      },
    });
    expect(purchaseAfterReactivate).toBeNull();
  });

  it("archive un client empêche une nouvelle commande, réactiver le restaure", async () => {
    const { data: client } = await gerant
      .from("clients")
      .insert({ company_id: companyId, name: `Client ${tag} C` })
      .select("id")
      .single();
    const { data: product } = await gerant
      .from("products")
      .insert({
        company_id: companyId,
        name: `Produit ${tag} C`,
        price: 1000,
        stock: 0,
        unit: "unité",
        vat_exempt: false,
      })
      .select("id")
      .single();

    await gerant.from("clients").update({ active: false }).eq("id", client!.id);

    const { error: orderErr } = await gerant.rpc("create_order", {
      payload: {
        warehouse_id: warehouseId,
        client_id: client!.id,
        items: [{ product_id: product!.id, quantity: 1 }],
      },
    });
    expect(orderErr?.message).toMatch(/archiv/i);

    await gerant.from("clients").update({ active: true }).eq("id", client!.id);

    const { error: orderAfterReactivate } = await gerant.rpc("create_order", {
      payload: {
        warehouse_id: warehouseId,
        client_id: client!.id,
        items: [{ product_id: product!.id, quantity: 1 }],
      },
    });
    expect(orderAfterReactivate).toBeNull();
  });

  it("archive un magasin empêche achat et commande, réactiver le restaure", async () => {
    const { data: warehouse } = await magasinier
      .from("warehouses")
      .insert({ company_id: companyId, name: `Magasin ${tag}` })
      .select("id")
      .single();
    const { data: supplier } = await gerant
      .from("suppliers")
      .insert({ company_id: companyId, name: `Fournisseur ${tag} D` })
      .select("id")
      .single();
    const { data: client } = await gerant
      .from("clients")
      .insert({ company_id: companyId, name: `Client ${tag} D` })
      .select("id")
      .single();
    const { data: product } = await gerant
      .from("products")
      .insert({
        company_id: companyId,
        name: `Produit ${tag} D`,
        price: 1000,
        stock: 0,
        unit: "unité",
        vat_exempt: false,
      })
      .select("id")
      .single();

    await magasinier.from("warehouses").update({ active: false }).eq("id", warehouse!.id);

    const { error: purchaseErr } = await gerant.rpc("create_purchase", {
      payload: {
        supplier_id: supplier!.id,
        warehouse_id: warehouse!.id,
        items: [{ product_id: product!.id, quantity: 1, unit_cost: 1000 }],
      },
    });
    expect(purchaseErr?.message).toMatch(/archiv/i);

    const { error: orderErr } = await gerant.rpc("create_order", {
      payload: {
        warehouse_id: warehouse!.id,
        client_id: client!.id,
        items: [{ product_id: product!.id, quantity: 1 }],
      },
    });
    expect(orderErr?.message).toMatch(/archiv/i);

    await magasinier.from("warehouses").update({ active: true }).eq("id", warehouse!.id);

    const { error: purchaseAfterReactivate } = await gerant.rpc("create_purchase", {
      payload: {
        supplier_id: supplier!.id,
        warehouse_id: warehouse!.id,
        items: [{ product_id: product!.id, quantity: 1, unit_cost: 1000 }],
      },
    });
    expect(purchaseAfterReactivate).toBeNull();
  });

  it("un compte archivé perd tout accès (RLS + RPC), un compte réactivé le retrouve", async () => {
    const login = `arch-test-${Date.now()}`;
    const { data: created, error: createErr } = await admin.functions.invoke<{ id: string; login: string }>(
      "create-user",
      { body: { login, companyId } },
    );
    expect(createErr).toBeNull();
    const userId = created!.id;

    // Compte encore actif : l'authentification et la lecture doivent fonctionner. Email
    // synthétique résolu UNE SEULE FOIS ici (pendant que le compte est encore actif) et
    // réutilisé pour les trois tentatives de connexion directe ci-dessous -- une fois
    // archivé, resolve_login_email ne résout plus (active = false, par construction,
    // 0072_identifiants_login.sql), ce qui teste une chose différente (le vrai parcours
    // LoginPage refuserait la connexion dès la résolution) et non le comportement RLS
    // après authentification que ce test vérifie spécifiquement.
    const resolveClient = createClient<Database>(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: resolvedEmail, error: resolveErr } = await resolveClient.rpc("resolve_login_email", {
      p_login: login,
    });
    expect(resolveErr).toBeNull();
    expect(resolvedEmail).toBeTruthy();
    const email = resolvedEmail as string;

    const before = createClient<Database>(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInBeforeErr } = await before.auth.signInWithPassword({
      email,
      password: DEFAULT_PASSWORD,
    });
    expect(signInBeforeErr).toBeNull();
    const { data: ccidBefore } = await before.rpc("current_company_id");
    expect(ccidBefore).toBe(companyId);
    await before.auth.signOut();

    // Archivage par l'Administrateur (utilisateurs.gerer -- garde de non-régression
    // pour la policy users_admin_write corrigée en 0049).
    const { data: archived, error: archiveErr } = await admin
      .from("users")
      .update({ active: false })
      .eq("id", userId)
      .select("id, active");
    expect(archiveErr).toBeNull();
    expect(archived).toHaveLength(1);
    expect(archived![0].active).toBe(false);

    // Un compte archivé ne peut plus résoudre son identifiant (resolve_login_email exclut
    // active = false, 0072_identifiants_login.sql) -- le vrai parcours LoginPage refuse
    // donc la connexion dès cette étape, avant même signInWithPassword.
    const { data: resolvedAfterArchive } = await resolveClient.rpc("resolve_login_email", { p_login: login });
    expect(resolvedAfterArchive).toBeNull();

    // L'authentification Supabase réussit toujours (mot de passe inchangé), mais plus
    // aucun accès : current_company_id()/current_role_name() renvoient null, ce qui
    // bloque déjà la quasi-totalité des policies RLS et fonctions RPC.
    const after = createClient<Database>(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: signInAfterErr } = await after.auth.signInWithPassword({
      email,
      password: DEFAULT_PASSWORD,
    });
    expect(signInAfterErr).toBeNull();

    const { data: ccidAfter } = await after.rpc("current_company_id");
    expect(ccidAfter).toBeNull();

    const { data: clientsRead } = await after.from("clients").select("id").limit(1);
    expect(clientsRead).toHaveLength(0);
    await after.auth.signOut();

    // Réactivation : l'accès revient.
    const { error: reactivateErr } = await admin.from("users").update({ active: true }).eq("id", userId);
    expect(reactivateErr).toBeNull();

    const reactivatedClient = createClient<Database>(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await reactivatedClient.auth.signInWithPassword({ email, password: DEFAULT_PASSWORD });
    const { data: ccidReactivated } = await reactivatedClient.rpc("current_company_id");
    expect(ccidReactivated).toBe(companyId);
    await reactivatedClient.auth.signOut();
  });

  it("seul un profil avec l'attribution utilisateurs.gerer peut archiver un compte", async () => {
    // Le Gérant ne détient pas utilisateurs.gerer : la policy users_admin_write doit
    // filtrer la ligne (0 ligne affectée, pas d'erreur PostgREST -- comportement RLS
    // standard sur UPDATE).
    const { data: gerantRow } = await gerant
      .from("users")
      .select("id")
      .eq("login", CREDENTIALS.gerant.login as string)
      .single();

    const { data: attemptResult, error: attemptErr } = await gerant
      .from("users")
      .update({ active: false })
      .eq("id", gerantRow!.id)
      .select("id");
    expect(attemptErr).toBeNull();
    expect(attemptResult).toHaveLength(0);

    // Confirme que le compte n'a effectivement pas été touché.
    const { data: stillActive } = await admin
      .from("users")
      .select("active")
      .eq("id", gerantRow!.id)
      .single();
    expect(stillActive?.active).toBe(true);
  });

  it("seul un profil avec l'attribution comptabilite.modifier_capital_social peut modifier les paramètres de la société (garde de non-régression pour companies_admin_write)", async () => {
    const { data: company, error: readErr } = await comptable
      .from("companies")
      .select("vat_rate")
      .eq("id", companyId)
      .single();
    expect(readErr).toBeNull();
    const currentVatRate = company!.vat_rate;

    // Le Comptable détient comptabilite.modifier_capital_social (opérationnelle) :
    // réécrire la même valeur doit réussir.
    const { data: comptableWrite, error: comptableWriteErr } = await comptable
      .from("companies")
      .update({ vat_rate: currentVatRate })
      .eq("id", companyId)
      .select("id");
    expect(comptableWriteErr).toBeNull();
    expect(comptableWrite).toHaveLength(1);

    // Le Gérant ne détient pas cette attribution : la même écriture doit être filtrée
    // par RLS (0 ligne affectée).
    const { data: gerantWrite, error: gerantWriteErr } = await gerant
      .from("companies")
      .update({ vat_rate: currentVatRate })
      .eq("id", companyId)
      .select("id");
    expect(gerantWriteErr).toBeNull();
    expect(gerantWrite).toHaveLength(0);
  });
});
