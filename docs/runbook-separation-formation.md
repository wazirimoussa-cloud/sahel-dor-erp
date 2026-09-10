# Runbook — séparation Formation / Production

Sépare Formation dans son propre projet Supabase. Point 2 de `plan-remediation.md`.

**Légende** : `[U]` = action utilisateur (compte Supabase/Vercel, clés `service_role`,
facturation) · `[C]` = fait par Claude (code / config / SQL lecture seule).

**État actuel** : un seul projet Supabase `parbrpqsotkpwxoqlmcn` (org `abaanxeexqjfgrzlxvmr`,
eu-west-1) héberge Production (`company_id …001`) et Formation (`…0f0`). Un second projet
`fvayodtstgbebnaihdwz` (« sahel ») existe déjà dans l'org, non lié, contenu inconnu —
**à confirmer avant la Phase B** : le réutiliser (s'il est vide) ou en créer un dédié.

**Décisions** : projet vierge + seed reconstruit (pas de copie de Production) ; Formation
garde le `company_id …0f0` ; tier Free.

---

## Phase A — Préparation au repo · [C] · FAIT

- [x] `supabase/scripts/seed-formation.sql` — société Formation + 26 comptes du plan
      comptable, extraits du projet partagé le 2026-09-10. Idempotent.
- [x] `supabase/scripts/provision-formation-auth.mjs` — recrée les 5 comptes
      (`admin/comptable/gerant/magasinier/superviseur.formation`) via l'API Admin +
      leurs 80 attributions. `--dry-run` disponible. Refuse de tourner contre le projet
      partagé.
- [x] `.env.example` — variables des deux projets documentées.
- [x] Ce runbook.

Rien n'est encore activé après la Phase A.

---

## Phase B — Nouveau projet · [U] + [C]

1. **[U]** Décider : réutiliser `fvayodtstgbebnaihdwz` (vérifier qu'il est vide via le
   Dashboard) **ou** créer `sahel-dor-erp-formation` (tier Free, région **eu-west-1**).
   Fixer un mot de passe DB. Relever : `project-ref`, `URL`, `anon key`,
   `service_role key`.
2. **[U → C]** Depuis le repo :
   ```
   supabase link --project-ref <ref-formation>
   supabase db push          # applique les 84 migrations sur la base vierge
   ```
   Si le classifieur bloque `db push` côté Claude, l'utilisateur le lance.
3. **[U → C]** Exécuter le seed contre le nouveau projet :
   ```
   supabase db query --linked --file supabase/scripts/seed-formation.sql
   ```
   Vérifier : `select count(*) from chart_of_accounts;` → 26.
4. **[U]** Edge functions sur le nouveau projet :
   ```
   supabase functions deploy create-user request-password-reset reset-password
   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service_role-formation>
   supabase secrets set DEFAULT_PASSWORD=<mot de passe partagé>
   ```
5. **[U]** Créer les comptes :
   ```
   SUPABASE_URL=<url-formation> \
   SUPABASE_SERVICE_ROLE_KEY=<service_role-formation> \
   DEFAULT_PASSWORD=<mot de passe partagé> \
   node supabase/scripts/provision-formation-auth.mjs --dry-run   # contrôle
   # puis sans --dry-run
   ```
   Vérifier : `select login from users order by login;` → les 5 comptes.
6. **[U, optionnel]** Ajouter le secret GitHub `SUPABASE_DB_URL` = chaîne Postgres du
   nouveau projet, si on veut aussi le sauvegarder via `.github/workflows/backup.yml`.

---

## Phase C — Bascule · [U] + [C]

7. **[U]** Vercel, projet `sahel-dor-erp-formation` → Settings → Environment Variables :
   repointer `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` vers le nouveau projet.
   Redéployer (`vercel --prod` ou depuis le Dashboard).
8. **[C]** Vérification en direct sur `https://sahel-dor-erp-formation.vercel.app`
   (session de test injectée, onglet frais) :
   - connexion `comptable.formation` → dashboard Finance charge, `/etats-financiers`
     charge, zéro erreur console ;
   - connexion `magasinier.formation` → dashboard Magasin charge ;
   - `curl -s https://sahel-dor-erp.vercel.app` → **Production inchangée**.
9. **[U]** Mettre à jour les credentials de test :
   - `.env.local` (poste dev) : `VITE_SUPABASE_URL/ANON_KEY` + `TEST_*_PASSWORD` →
     nouveau projet ;
   - Secrets CI (`Settings → Secrets → Actions`) : idem, pour le job d'intégration.

---

## Phase D — Après bascule · [C]

10. `.github/workflows/ci.yml` — ajouter un job `integration` (`npm run test:integration`)
    avec les secrets Formation. Skippé proprement si absents
    (`tests/integration/helpers/auth.ts`).
11. `vitest.integration.config.ts` — tenter `fileParallelism: true` ; si les tests
    interfèrent encore, rester séquentiel et ouvrir un sous-chantier « tests hermétiques ».
12. `docs/plan-remediation.md` — cocher le point 2, journal.
13. `README` — section déploiement : documenter les deux projets, et le fait que toute
    migration passe **d'abord** par Formation.
14. **[U]** Supprimer les 5 comptes `*.formation` de l'ancien projet partagé et la société
    `…0f0` (via `reset_formation_data` puis suppression manuelle de la société), une fois
    la bascule confirmée stable pendant quelques jours.

---

## Rollback

- **Avant l'étape 7** : ne rien faire — le nouveau projet reste inutilisé, aucun impact.
- **Après l'étape 7** : repointer les variables Vercel de `sahel-dor-erp-formation` vers
  l'ancien projet `parbrpqsotkpwxoqlmcn` et redéployer. Les comptes `*.formation` de
  l'ancien projet n'ont pas encore été supprimés (étape 14), donc retour immédiat à l'état
  d'avant.
- Production n'est **jamais** touchée par cette opération.
