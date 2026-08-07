#!/usr/bin/env node
// Test de charge en lecture seule contre Formation (jamais Production -- backend partagé,
// voir README). Simule ~15-20 utilisateurs concurrents naviguant dans l'app : chaque
// "utilisateur virtuel" se connecte une fois (comme un vrai utilisateur), puis boucle sur
// des scénarios calqués sur les vraies requêtes des pages (Tableau de bord, Produits,
// Stock, Achats, Commandes, Journal comptable, États financiers, Déclaration TVA), avec un
// temps de réflexion aléatoire entre deux "pages" pour rester réaliste plutôt que de
// marteler l'API en continu. Aucune écriture -- zéro risque de pollution des données
// Formation. Node natif uniquement (fetch, pas de dépendance ajoutée au projet).
//
// Usage : node tests/load/read-only-load-test.mjs [concurrence] [durée_secondes]
// Par défaut : 18 utilisateurs virtuels, 30 secondes.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function loadEnvFile(relativePath) {
  const env = {};
  const content = readFileSync(path.join(ROOT, relativePath), "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return env;
}

const env = loadEnvFile(".env.local");
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const ANON_KEY = env.VITE_SUPABASE_ANON_KEY;

const ACCOUNTS = [
  { email: env.TEST_GERANT_EMAIL, password: env.TEST_GERANT_PASSWORD },
  { email: env.TEST_MAGASINIER_EMAIL, password: env.TEST_MAGASINIER_PASSWORD },
  { email: env.TEST_SUPERVISEUR_EMAIL, password: env.TEST_SUPERVISEUR_PASSWORD },
  { email: env.TEST_COMPTABLE_EMAIL, password: env.TEST_COMPTABLE_PASSWORD },
  { email: env.TEST_ADMIN_EMAIL, password: env.TEST_ADMIN_PASSWORD },
].filter((a) => a.email && a.password);

if (!SUPABASE_URL || !ANON_KEY || ACCOUNTS.length === 0) {
  console.error("Variables d'environnement manquantes (.env.local) -- voir .env.example.");
  process.exit(1);
}

const CONCURRENCY = Number(process.argv[2] ?? 18);
const DURATION_MS = Number(process.argv[3] ?? 30) * 1000;
const THINK_TIME_MIN = 150;
const THINK_TIME_MAX = 600;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    throw new Error(`Connexion échouée pour ${email} : ${JSON.stringify(json)}`);
  }
  return json.access_token;
}

async function timedRequest(name, token, urlPath, { method = "GET", headers = {} } = {}) {
  const start = performance.now();
  let status = 0;
  let ok = false;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${urlPath}`, {
      method,
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, ...headers },
    });
    status = res.status;
    ok = res.ok;
    await res.arrayBuffer(); // draine le corps, le temps de téléchargement compte dans la mesure
  } catch {
    status = 0;
    ok = false;
  }
  const ms = performance.now() - start;
  results.push({ name, ms, status, ok });
}

// Scénarios calqués sur les requêtes réelles des hooks (src/features/**/use*.ts), chacun
// représentant les requêtes tirées EN PARALLÈLE au chargement d'une page (Promise.all côté
// app). company_id résolu une fois au démarrage, comme le fait AuthProvider.
function buildScenarios(companyId) {
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
  const in30Days = new Date(today.getTime() + 30 * 86400000).toISOString().slice(0, 10);

  return {
    "Tableau de bord": (token) =>
      Promise.all([
        timedRequest("dashboard:products", token, "products?select=id,name,stock,unit"),
        timedRequest("dashboard:low_stock", token, "products?select=id,name,stock,unit"),
        timedRequest("dashboard:monthly_activity", token, `journal_entries?select=entry_date,journal_entry_lines(debit,credit,chart_of_accounts(code))&entry_date=gte.${monthStart}`),
        timedRequest("alerts:products", token, "products?select=stock,unit"),
        timedRequest("alerts:orders_pending", token, "orders?select=id&status=eq.pending", {
          method: "HEAD",
          headers: { Prefer: "count=exact" },
        }),
        timedRequest("alerts:orders_unpaid", token, "orders?select=id&payment_status=eq.unpaid", {
          method: "HEAD",
          headers: { Prefer: "count=exact" },
        }),
        timedRequest(
          "alerts:stock_expiring",
          token,
          `stock_lots?select=id&quantity_remaining=gt.0&expiry_date=not.is.null&expiry_date=lte.${in30Days}`,
          { method: "HEAD", headers: { Prefer: "count=exact" } },
        ),
      ]),
    Produits: (token) =>
      Promise.all([
        timedRequest("products:list", token, "products?select=id,name,price,stock,unit,vat_exempt,company_id,created_at,active&order=name.asc&limit=25&offset=0"),
      ]),
    Stock: (token) =>
      Promise.all([
        timedRequest(
          "stock_lots:list",
          token,
          "stock_lots?select=id,lot_number,quantity_remaining,unit_cost,expiry_date,created_at,product_id,warehouse_id,products(name,unit),warehouses(name)&quantity_remaining=gt.0&order=expiry_date.asc",
        ),
      ]),
    Achats: (token) =>
      Promise.all([
        timedRequest(
          "purchases:list",
          token,
          "purchases?select=id,status,created_at,suppliers(name),warehouses(name),companies(vat_rate),purchase_items(quantity,unit_cost,products(vat_exempt))&order=created_at.desc&limit=25&offset=0",
        ),
      ]),
    Commandes: (token) =>
      Promise.all([
        timedRequest(
          "orders:list",
          token,
          "orders?select=id,status,payment_status,amount_paid,created_at,clients(name),companies(vat_rate),order_items(quantity,unit_price,products(name,vat_exempt))&order=created_at.desc&limit=25&offset=0",
        ),
      ]),
    "Journal comptable": (token) =>
      Promise.all([
        timedRequest(
          "journal_entries:list",
          token,
          "journal_entries?select=id,entry_date,journal_code,description,journal_entry_lines(debit,credit,chart_of_accounts(code,name))&order=entry_date.desc&limit=25&offset=0",
        ),
      ]),
    "États financiers": (token) =>
      Promise.all([
        timedRequest("financials:products", token, "products?select=id,name,unit"),
        timedRequest(
          "financials:purchase_lots",
          token,
          "stock_lots?select=product_id,quantity_received,unit_cost,transactions!stock_lots_source_transaction_id_fkey!inner(purchase_id)&transactions.purchase_id=not.is.null",
        ),
        timedRequest("financials:transactions", token, "transactions?select=product_id,type,quantity,created_at"),
        timedRequest(
          "financials:journal",
          token,
          "journal_entries?select=entry_date,journal_entry_lines(debit,credit,chart_of_accounts(code))",
        ),
        timedRequest("financials:company", token, `companies?select=capital_social&id=eq.${companyId}`),
        timedRequest(
          "financials:fixed_assets",
          token,
          "fixed_assets?select=id,name,category,acquisition_date,acquisition_cost,useful_life_years,disposal_date,depreciation_method,degressif_coefficient",
        ),
      ]),
    "Déclaration TVA": (token) =>
      Promise.all([
        timedRequest(
          "vat:journal",
          token,
          `journal_entries?select=entry_date,journal_entry_lines(debit,credit,chart_of_accounts(code))&entry_date=gte.${monthStart}`,
        ),
      ]),
  };
}

const results = [];

async function virtualUser(id, scenarios) {
  const account = ACCOUNTS[id % ACCOUNTS.length];
  const token = await signIn(account.email, account.password);
  const scenarioNames = Object.keys(scenarios);
  const deadline = Date.now() + DURATION_MS;
  while (Date.now() < deadline) {
    const name = scenarioNames[Math.floor(Math.random() * scenarioNames.length)];
    await scenarios[name](token);
    await sleep(THINK_TIME_MIN + Math.random() * (THINK_TIME_MAX - THINK_TIME_MIN));
  }
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function report() {
  const byName = new Map();
  for (const r of results) {
    if (!byName.has(r.name)) byName.set(r.name, []);
    byName.get(r.name).push(r);
  }

  console.log(`\n=== Test de charge lecture seule -- Formation ===`);
  console.log(`Utilisateurs virtuels : ${CONCURRENCY} | Durée : ${DURATION_MS / 1000}s | Comptes : ${ACCOUNTS.length}\n`);

  const header = "Requête".padEnd(28) + "N".padStart(6) + "Erreurs".padStart(9) + "Moy(ms)".padStart(10) + "P50".padStart(8) + "P95".padStart(8) + "P99".padStart(8) + "Max".padStart(8);
  console.log(header);
  console.log("-".repeat(header.length));

  let totalCount = 0;
  let totalErrors = 0;
  const allLatencies = [];

  for (const [name, entries] of [...byName.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const latencies = entries.map((e) => e.ms).sort((a, b) => a - b);
    const errors = entries.filter((e) => !e.ok).length;
    const avg = latencies.reduce((s, v) => s + v, 0) / latencies.length;
    totalCount += entries.length;
    totalErrors += errors;
    allLatencies.push(...latencies);

    console.log(
      name.padEnd(28) +
        String(entries.length).padStart(6) +
        String(errors).padStart(9) +
        avg.toFixed(0).padStart(10) +
        percentile(latencies, 50).toFixed(0).padStart(8) +
        percentile(latencies, 95).toFixed(0).padStart(8) +
        percentile(latencies, 99).toFixed(0).padStart(8) +
        Math.max(...latencies).toFixed(0).padStart(8),
    );
  }

  allLatencies.sort((a, b) => a - b);
  console.log("-".repeat(header.length));
  console.log(`Total : ${totalCount} requêtes, ${totalErrors} erreurs (${((totalErrors / totalCount) * 100).toFixed(2)}%)`);
  console.log(
    `Latence globale -- moy: ${(allLatencies.reduce((s, v) => s + v, 0) / allLatencies.length).toFixed(0)}ms | P50: ${percentile(allLatencies, 50).toFixed(0)}ms | P95: ${percentile(allLatencies, 95).toFixed(0)}ms | P99: ${percentile(allLatencies, 99).toFixed(0)}ms`,
  );
  console.log(`Débit : ${(totalCount / (DURATION_MS / 1000)).toFixed(1)} req/s\n`);

  if (totalErrors > 0) {
    console.log("Détail des erreurs (statut HTTP, jusqu'à 10) :");
    const failed = results.filter((r) => !r.ok).slice(0, 10);
    for (const f of failed) console.log(`  ${f.name} -> HTTP ${f.status}`);
  }
}

async function main() {
  console.log(`Connexion de ${CONCURRENCY} utilisateurs virtuels (${ACCOUNTS.length} comptes Formation)...`);
  const bootToken = await signIn(ACCOUNTS[0].email, ACCOUNTS[0].password);
  const meRes = await fetch(`${SUPABASE_URL}/rest/v1/users?select=company_id&email=eq.${encodeURIComponent(ACCOUNTS[0].email)}`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${bootToken}` },
  });
  const [me] = await meRes.json();
  const companyId = me?.company_id;
  if (!companyId) {
    console.error("Impossible de résoudre company_id -- abandon.");
    process.exit(1);
  }
  const scenarios = buildScenarios(companyId);

  console.log(`Démarrage du run (${DURATION_MS / 1000}s)...`);
  const startedAt = Date.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => virtualUser(i, scenarios)));
  console.log(`Terminé en ${((Date.now() - startedAt) / 1000).toFixed(1)}s.`);

  report();
}

main().catch((err) => {
  console.error("Échec du test de charge :", err);
  process.exit(1);
});
