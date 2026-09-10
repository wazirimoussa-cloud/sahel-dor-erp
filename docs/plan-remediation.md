# Plan de remédiation technique

Document de suivi des chantiers de fond identifiés lors du diagnostic du 2026-09-10.
À tenir à jour : mettre à jour la colonne **État**, dater chaque avancée dans le
_Journal_ en bas, et lier le numéro de migration / commit correspondant.

**Légende État** : `à faire` · `en cours` · `fait` · `abandonné (raison)`

## Priorités

| # | Chantier | Gravité | Effort | État |
|---|----------|---------|--------|------|
| 1 | [Sauvegardes / PITR](#1-sauvegardes--pitr) | Critique | ½ j | à faire |
| 2 | [Séparer Formation de Production](#2-séparer-formation-de-production) | Élevée | 1 j | à faire |
| 3 | [Tests d'intégration en CI](#3-tests-dintégration-en-ci) | Élevée | 2-3 j | à faire |
| 4 | [RLS par attribution](#4-rls-par-attribution) | Élevée | plusieurs j | à faire |
| 5 | [Perf du cœur comptable](#5-perf-du-cœur-comptable) | Moyenne | 1 j + | à faire |
| 6 | [Dette légère](#6-dette-légère) | Faible | ~2 j cumulés | à faire |

Ordre conseillé : 1 → 2 → 3 → 4 → 5. Le point 3 est le socle qui rend 4 et 5
faisables sans régression.

---

## 1. Sauvegardes / PITR

**État actuel** : observé pendant le diagnostic — `pitr_enabled: false`, `backups: []`.
Le wipe de Formation de cette session était irrécupérable. Production a la même
exposition : perte de données = perte définitive.

**Actions**
- [ ] Vérifier le tier du projet Supabase (`parbrpqsotkpwxoqlmcn`). Le `backups: []`
      suggère le plan **Free** = aucune sauvegarde.
- [ ] Passer en **Pro** → sauvegardes quotidiennes automatiques.
- [ ] Si RPO < 24h nécessaire : ajouter l'add-on **PITR** (7 jours).
- [ ] Stopgap immédiat, indépendant du tier : workflow GitHub Actions planifié
      (`nightly`) qui exécute `supabase db dump` vers un bucket R2/S3 chiffré.
- [ ] **Tester une restauration** sur un projet jetable — sinon ça ne compte pas.

**Fini quand** : une restauration a été testée avec succès et la procédure est écrite ici.

---

## 2. Séparer Formation de Production

**État actuel** : un seul projet Supabase, Production et Formation séparées uniquement
par `company_id` (`…001` vs `…0f0`). Conséquences observées :
- Les tests d'intégration (`tests/integration/`) frappent la société Formation de ce
  projet partagé — `vitest.integration.config.ts` a dû désactiver `fileParallelism`
  car les fichiers interféraient (un test comptait les `journal_entries` pendant
  qu'un autre en créait).
- Impossible de tester une migration avant Production.
- Une requête folle ou une erreur de RLS touche les deux environnements.

**Actions**
- [ ] Créer un **second projet Supabase** pour Formation (Free suffit).
- [ ] `supabase db dump --schema-only` depuis le projet actuel → `db push` vers le
      nouveau (+ données de seed si besoin).
- [ ] Repointer les variables d'env Vercel de `sahel-dor-erp-formation`.
- [ ] Mettre à jour la doc de déploiement (le _dance_ `supabase link`) et
      `.env.example`.
- [ ] Simplifier `reset_formation_data()` en `truncate` global une fois isolé.
- [ ] Router les tests d'intégration vers ce nouveau projet ; réactiver
      `fileParallelism` si l'isolation par test le permet.

**Fini quand** : Formation a son propre `project-ref`, les migrations passent d'abord
par Formation, les tests d'intégration ne touchent plus l'instance de Production.

---

## 3. Tests d'intégration en CI

**État actuel** : la couverture existe mais n'est pas outillée.
- Unitaires : `tests/unit/` — 6 fichiers (`computeFinancialStatements`,
  `computeVatDeclaration`, `format`, `LoginPage`, `stock-transaction`,
  `useFixedAssets`). Lancés par `npm test`.
- Intégration : `tests/integration/` — 8 fichiers (auth, archivage, cycle complet,
  paie, production-ledger, purchase-to-payment, stock-and-assets). Lancés
  séparément par `npm run test:integration`, contre le projet Supabase partagé.
- Charge : `tests/load/read-only-load-test.mjs`.
- **Aucun `.github/workflows/`** — rien ne garde un merge.
- Aucun test ciblant spécifiquement les **politiques RLS**.
- Aucun E2E navigateur.

**Actions**
- [ ] Workflow GitHub Actions : `typecheck` + `lint` + `test` + `build` sur chaque PR.
- [ ] Ajouter `test:integration` au workflow, contre le projet Formation isolé
      (point 2) ou une instance `supabase start` éphémère.
- [ ] Nouveau `tests/unit/stockValuation.test.ts` — CUMP, `stockValueAsOf`, rotation
      (fonctions pures dans `src/lib/stockValuation.ts`, aujourd'hui couvertes
      seulement indirectement).
- [ ] Nouveau `tests/unit/businessHours.test.ts` — porter les 4 cas déjà vérifiés à
      la main pour `businessHoursElapsed` dans `SupervisorDashboard.tsx` (weekend
      traversé, span multi-jours, bornes).
- [ ] Nouveau `tests/integration/rls-attributions.test.ts` — « utilisateur avec
      l'attribution X voit / ne voit pas la table Y ». Bloque les régressions du
      point 4.
- [ ] 2-3 E2E Playwright sur le chemin critique : commande → validation → mouvement
      de stock → écriture au journal.

**Fini quand** : une PR ne peut plus être mergée si un test échoue, et le suite
d'intégration ne dépend plus d'un état partagé fragile.

---

## 4. RLS par attribution

**État actuel** : le mécanisme existe mais n'est appliqué qu'à la compta.
- `public.has_attribution(action_key, level)` est déjà défini et utilisé.
- **Seules** `journal_entries` / `journal_entry_lines` ont une policy `SELECT`
  scopée attribution (`has_attribution('journal_comptable.consulter', …)`,
  migration `0032`, révisée `0052`).
- **Toutes les autres tables** ne filtrent que par `company_id` :
  `orders`, `transactions`, `purchases`, `products`, `productions`,
  `stock_loss_requests`, `clients`, `suppliers`… et surtout **`payslips`**
  (données de salaire lisibles par tout utilisateur authentifié de la société).
- Les écritures sont, elles, bien protégées (RPC `security definer` + triggers de
  conflit + `fn_block_mutation`). Le trou est en **lecture**.

**Actions** (table par table, de la plus sensible à la moins)
- [ ] `payslips`, `payroll_*` → `has_attribution('paie.*')`.
- [ ] `stock_loss_requests` → `has_attribution('pertes_stock.declarer' | '.approuver')`.
- [ ] `transactions`, `stock_lots`, `product_stocks` → module `stock` / `entrepots`.
- [ ] `purchases`, `purchase_items`, `purchase_losses` → module `achats` /
      `transporteurs`.
- [ ] `orders`, `order_items`, `order_payments` → module `ventes`.
- [ ] `productions`, `transformations` (+ lignes) → modules `production` /
      `transformation`.
- [ ] Verrouiller `user_attributions` : un non-admin ne lit que ses propres lignes.
- [ ] **Décision transverse** : les dashboards affichent des compteurs hors-module
      volontaires (ex. « Réceptions en attente » sur Magasin sans `achats`). Choix à
      acter : soit ces tuiles passent par une RPC `security definer` renvoyant
      seulement l'agrégat, soit elles disparaissent pour ces profils. Recommandation :
      RPC.
- [ ] Après chaque table : `explain analyze` sur les grosses requêtes (les fonctions
      de policy peuvent coûter par ligne ; `has_attribution` doit être `stable`).

**Fini quand** : `tests/integration/rls-attributions.test.ts` passe pour toutes les
tables sensibles, et un accès API direct hors module renvoie 0 ligne.

---

## 5. Perf du cœur comptable

**État actuel** : `useFinancialStatements` (`src/features/financials/`) est la requête
la plus lourde (jointures `journal_entries` / `stock_lots`, P95 ~1,7 s, pointes
6-7 s en charge — cf. README point 63). Le dashboard Finance l'appelle deux fois
(période + N-1). Pas de vue matérialisée, pas d'écriture de clôture : chaque bilan
rejoue tout l'historique. Les hooks de dashboard agrègent côté client (fetch de
lignes brutes + `reduce` en JS).

**Actions**
- [ ] Court terme : transformer `useMonthlyActivity` et les agrégations du journal en
      **RPC renvoyant des agrégats** (`sum` / `group by` dans Postgres).
- [ ] Une seule RPC pour période + N-1 (un aller-retour au lieu de deux).
- [ ] Vérifier / ajouter les index : `journal_entries(company_id, created_at)`,
      `stock_lots(product_id, …)`.
- [ ] Moyen terme : table `accounting_period_balances (company_id, période,
      compte, débit, crédit)` remplie à la clôture mensuelle (fonction + `pg_cron`).
      Bilan à une date = périodes clôturées + mouvements de la période ouverte
      seulement.
- [ ] Ne jamais ajouter de `refetchInterval` sur ces hooks (déjà noté au README).

**Fini quand** : le chargement du dashboard Finance reste < 1 s sur un jeu de données
représentatif, et le temps ne croît plus linéairement avec l'historique.

---

## 6. Dette légère

- [ ] **Types Supabase** : `db:types` écrit directement dans
      `src/lib/database.types.ts` et efface le bloc d'alias maintenu à la main.
      → déplacer les alias dans `src/lib/database.aliases.ts` (réexporte depuis le
      fichier généré), + check CI que `db:types` ne produit aucun diff.
- [ ] **Fuseau horaire** : `Africa/Lagos` codé en dur (`fn_business_hours_elapsed`,
      `businessHoursElapsed` côté client). Ajouter `companies.timezone` et le
      propager. À faire avant d'intégrer toute société hors WAT.
- [ ] **Bundle** : `exceljs` (~930 Ko) et `jspdf` (~400 Ko) chargés d'emblée.
      → `await import()` dans les handlers d'export/impression, `React.lazy` sur les
      pages de rapport lourdes. ~1,3 Mo en moins au chargement initial (pénalisant
      sur connexion lente).
- [ ] **`.gitignore`** : `.claude/` n'est ni ignoré ni suivi. Décider : l'ignorer,
      ou committer `.claude/launch.json` comme config de preview partagée.
- [ ] **Taux fiscaux** : IS / Précompte ISB / Taxe immobilière en attente de
      validation des collègues. Dès accord → une migration sur la config fiscale.

---

## Journal

| Date | Chantier | Avancée | Réf |
|------|----------|---------|-----|
| 2026-09-10 | — | Création du document (diagnostic initial) | — |
