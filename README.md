# ERP Sahel d'Or

Application de gestion (produits, stocks, commandes, utilisateurs, audit) développée à
partir du cahier des charges technique fourni (`SAHEL_DOR_Cahier_Technique_Developpeur.pdf`).

Stack : React + Vite + TypeScript, Supabase (PostgreSQL + Auth + Row Level Security),
Tailwind CSS, React Query, React Hook Form + Zod.

## Prérequis

- Node.js 20+
- Un projet Supabase existant (URL + clé anon + clé service_role)
- [Supabase CLI](https://supabase.com/docs/guides/cli) (`npm install -g supabase` ou via `npx`)

> Docker n'est pas requis : les migrations sont appliquées directement sur le projet
> Supabase distant (pas de développement local via `supabase start`).
>
> **Important — emplacement du projet** : ne placez pas ce projet dans un dossier
> synchronisé par OneDrive (ex. `Documents/`). Le driver de synchronisation cloud
> interfère avec la création de fichiers massifs de `npm install` (le dossier peut rester
> bloqué indéfiniment). Gardez-le sous un chemin local classique, ex. `C:\Users\<vous>\Projects\`.

## Installation

```bash
npm install
cp .env.example .env.local
# Renseigner VITE_SUPABASE_URL (sans suffixe /rest/v1/) et VITE_SUPABASE_ANON_KEY
```

## Base de données

1. Lier le projet local au projet Supabase distant :
   ```bash
   npx supabase login
   npx supabase link --project-ref <votre-project-ref>
   ```
2. Appliquer les migrations :
   ```bash
   npm run db:push
   ```
   (Alternative sans CLI : copier/coller le contenu de chaque fichier de
   `supabase/migrations/`, dans l'ordre, dans l'éditeur SQL du Dashboard Supabase, puis
   `supabase/seed.sql`.)
3. Générer les types TypeScript à partir du schéma réel (remplace le fichier écrit à la
   main `src/lib/database.types.ts`) :
   ```bash
   npm run db:types
   ```
4. Créer le premier compte admin : Dashboard Supabase → **Authentication → Users → Add
   user** (email + mot de passe, "Auto Confirm User" coché). Le trigger `handle_new_user`
   crée automatiquement son profil `public.users` avec le rôle `seller` par défaut.
   Promouvez-le ensuite en admin :
   ```sql
   update public.users
   set role_id = (select id from public.roles where name = 'admin'),
       company_id = '00000000-0000-0000-0000-000000000001'
   where email = 'votre-email@exemple.com';
   ```
   Les créations de compte suivantes passent par l'Edge Function `create-user` (voir
   plus bas), réservée aux admins.

## Développement

```bash
npm run dev
```

## Qualité

```bash
npm run typecheck   # tsc -b (vérifie effectivement les projets référencés)
npm run lint
npm run test
npm run build
```

## Déploiement de l'Edge Function (création d'utilisateurs)

La création de comptes utilisateurs nécessite la clé `service_role` (jamais exposée au
frontend). Elle est encapsulée dans une Edge Function :

```bash
npx supabase functions deploy create-user
npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<clé service_role>
```

## Déploiement du frontend

```bash
npm run build   # génère dist/
```
Hébergement statique au choix (Vercel, Netlify, serveur local...). Configurez
`VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` comme variables d'environnement du build.

## Rôles applicatifs

9 profils calqués sur le cahier des charges "Gestion des profils utilisateurs"
(introduits en `supabase/migrations/0016_agribusiness_governance.sql`, ajustables via
la table `roles` et les policies RLS) :

| Rôle (slug interne) | Accès |
|---|---|
| Administrateur (`admin`) | **Lecture seule** sur toutes les sociétés, écriture réservée à la gestion des comptes utilisateurs (et des sociétés, exception pragmatique — voir plus bas) |
| Gestionnaire de magasin (`warehouse_manager`) | Produits, entrepôts, réception des achats (stock IN), mouvements de stock manuels (société assignée) |
| Superviseur (`supervisor`) | Lecture large ; seul rôle habilité à **valider** une commande (déclenche la sortie de stock + l'écriture comptable) |
| Opérateur de vente (`sales_operator`) | Clients, création/annulation de commande (aucun impact stock à la création) (société assignée) |
| Responsable des achats (`purchasing`) | Fournisseurs, création/annulation de bon de commande (aucun impact stock) (société assignée) |
| Comptable (`accounting`) | Plan comptable (écriture), encaissement des paiements clients, lecture du journal comptable, États financiers (bilan, compte de résultat, capital social) (société assignée) |
| Responsable de production (`production_manager`) | Produits, cycle production/transformation (société assignée) |
| Contrôleur (`controller`) | Lecture seule (large, y compris journal d'audit et journal comptable) de sa société — pas d'écriture |
| Logistique / Transport (`logistics_transport`) | Lecture large, mouvements de stock manuels (livraisons) (société assignée) |

Chaque rôle non-admin lit largement les autres tables opérationnelles de sa société
(produits, magasins, achats, commandes, etc.) mais n'écrit que dans son périmètre —
la navigation reflète cette spécialité, plus stricte que les policies `select`
sous-jacentes (`admin` et `controller` voient tous les écrans métier en lecture,
`admin` seul voit en plus "Utilisateurs"). Les libellés français sont centralisés dans
`src/lib/roles.ts` (`ROLE_LABELS`). Le slug `admin` est resté inchangé (au lieu de
`administrateur`) pour ne pas modifier les 3 Edge Functions qui vérifient déjà
`callerRole === "admin"`. Exception assumée : la gestion des sociétés (`companies`)
reste réservée à `admin` — action d'infrastructure (nouveau tenant), pas une
"opération sensible" au sens métier du cahier, et aucun des 9 rôles n'en a la charge.
Seule exception : `accounting` peut modifier `companies.capital_social` (sa société
uniquement) depuis la page États financiers — nécessaire pour distinguer Capital de
Résultat cumulé au bilan (voir point 19).

**Séparation des tâches** : aucun rôle ne peut créer, valider et exécuter seul une même
opération. Cycle de vente : Opérateur de vente crée la commande (aucun impact stock) →
Superviseur valide (c'est cette étape, et seulement elle, qui fait sortir le stock et
génère l'écriture comptable VENTES) → Comptable encaisse. Cycle d'achat : Responsable
des achats crée le bon de commande (aucun impact stock) → Gestionnaire de magasin
réceptionne physiquement (c'est cette étape qui fait entrer le stock et génère
l'écriture comptable ACHATS).

## Écarts et améliorations par rapport au cahier des charges

Le cahier fourni était volontairement un squelette (pas de types de colonnes, pas de
détail sur `orders`, un seul exemple de RLS non scopé par rôle, mise à jour de stock
illustrée par un `UPDATE` manuel côté client). Ce qui a été ajouté ou changé, et pourquoi :

1. **Stock mis à jour par trigger DB** (`fn_apply_transaction_stock`, déclenché après
   chaque insertion dans `transactions`) plutôt qu'un `UPDATE products SET stock = stock
   - 1` exécuté par le code client. Avantage : atomique, ne peut pas être oublié ni
   contourné, fonctionne même pour une écriture faite directement en SQL. Le
   `CHECK (stock >= 0)` sur `products` fait échouer (et annule) toute transaction qui
   mettrait le stock en négatif — donc pas de survente possible.

2. **`orders` détaillé en `orders` + `order_items`** : une commande porte forcément
   plusieurs produits/quantités, ce qu'une seule table `orders` sans colonnes ne peut pas
   représenter.

3. **RPC transactionnelle `create_order`** (`SECURITY DEFINER`) : crée la commande, ses
   lignes et les sorties de stock correspondantes dans une seule transaction Postgres,
   au lieu d'enchaîner plusieurs appels REST séparés côté client (ce qui risquerait de
   laisser une commande à moitié créée en cas d'erreur réseau en cours de route).

4. **RLS réellement scopée par rôle**, via `current_role_name()` / `current_company_id()`
   (fonctions `SECURITY DEFINER`, utilisées dans toutes les policies). L'exemple du
   cahier (`auth.uid() = id`) ne fait que restreindre `users` à sa propre ligne — ce
   n'est pas du RBAC. Ici chaque table distingue les 6 rôles applicatifs (voir section
   "Rôles applicatifs") et scope par `company_id` (multi-société).

5. **`logs` en append-only côté serveur** : le cahier montrait un `INSERT INTO logs` fait
   « à la main » par le code applicatif — un client authentifié aurait pu falsifier ou
   simplement omettre des entrées. Ici, un trigger générique (`fn_audit_log`) journalise
   automatiquement tout `INSERT/UPDATE/DELETE` sur `products`, `orders`, `order_items` et
   `transactions`, et aucune policy RLS n'autorise `authenticated` à écrire dans `logs` —
   seul le trigger (propriétaire `postgres`, hors RLS) le peut.

6. **Contraintes d'intégrité** : `CHECK (stock >= 0)`, `CHECK (quantity > 0)` (ou signé
   pour un ajustement), types enum Postgres pour `transactions.type`
   (`IN` / `OUT` / `ADJUSTMENT`) et `orders.status`
   (`pending` / `validated` / `cancelled`) plutôt que du texte libre.

7. **`company_id` propagé** à `users`, `products`, `orders` : la table `companies`
   existait dans le cahier mais n'était reliée à rien — sans ce lien, pas de
   multi-société possible.

8. **Création d'utilisateurs via Edge Function** (`supabase/functions/create-user`, clé
   `service_role` côté serveur uniquement) plutôt qu'un self-signup ouvert — cohérent
   avec le fait que le cahier ne décrivait que la connexion (section 4), pas
   l'inscription.

9. **Transactions et logs immuables** : en plus des policies RLS, un trigger
   (`fn_block_mutation`) interdit `UPDATE`/`DELETE` sur `transactions` et `logs` pour
   quiconque — défense en profondeur, une correction se fait par une nouvelle
   transaction `ADJUSTMENT`, jamais en réécrivant l'historique.

10. **Stock multi-magasins + Achats** (`0004_warehouses.sql`, `0005_purchases.sql`) :
    l'activité réelle de Sahel d'Or dépasse le squelette initial (mono-magasin, pas
    d'approvisionnement fournisseur) — l'ERP couvre en réalité toute la chaîne
    Achat → Production → Transformation → Stock multi-magasins → Vente → Comptabilité.
    Première brique ajoutée : `warehouses` (magasins) + `product_stocks` (stock par
    `(produit, magasin)`, source de vérité — `products.stock` reste un total dénormalisé
    pour le dashboard existant) et `suppliers` + `purchases`/`purchase_items` (bons de
    commande d'achat). Différence délibérée avec `create_order` : une commande de vente
    décrémente le stock **dès sa création** (simplification déjà documentée au point
    suivant), alors qu'un achat ne crédite le stock qu'à la **réception réelle** de la
    marchandise (`receive_purchase`, RPC dédiée) — `create_purchase` ne touche pas au
    stock. `purchases`/`purchase_items` n'ont aucune policy RLS d'écriture : toute
    mutation passe par `create_purchase`/`receive_purchase`/`cancel_purchase`
    (`SECURITY DEFINER`), qui appliquent elles-mêmes rôle/société et garantissent
    l'atomicité stock+statut.

11. **Production + Transformation** (`0006_production.sql`, `0007_transformations.sql`) :
    deuxième et troisième maillons de la chaîne. Trois mécanismes de crédit/débit de stock
    coexistent désormais, chacun avec sa RPC dédiée et sa colonne de traçabilité propre sur
    `transactions` (`purchase_id`, `production_id`, `transformation_id`) : un **achat**
    crédite le stock à la réception (fournisseur externe) ; une **production** crédite le
    stock sans rien consommer (l'entreprise crée elle-même, ex. récolte) ; une
    **transformation** débite un ou plusieurs produits (intrants) et crédite un ou
    plusieurs produits différents (extrants) dans le même magasin, ex. grain brut →
    farine. Comme les achats, `productions`/`production_items` et
    `transformations`/`transformation_inputs`/`transformation_outputs` n'ont aucune policy
    RLS d'écriture — tout passe par `create_production`/`create_transformation`
    (`SECURITY DEFINER`). Contrairement aux achats, ce sont des faits atomiques immédiats
    (pas de statut `pending`/`received` : la RPC crée l'en-tête, les lignes et les
    transactions en une seule fois). Aucune "recette" n'est prédéfinie en base — chaque
    événement déclare ses propres lignes à la saisie, conformément au choix de laisser
    l'utilisateur configurer produits/quantités selon ses besoins réels.

12. **Vente : clients, paiement, annulation sûre** (`0008_clients.sql`,
    `0009_order_enhancements.sql`) : dernier maillon avant la Comptabilité. `clients` est
    la table jumelle exacte de `suppliers`, et `orders.client_id` devient obligatoire
    (bootstrap "Client comptant" par société pour les commandes déjà en base, même
    mécanique que "Magasin principal" en 0004). `orders` gagne aussi `payment_status`
    (`unpaid`/`partial`/`paid`) et `amount_paid`, mis à jour par la RPC `record_payment` —
    aucun impact sur le grand livre, mais on garde le principe "aucune écriture directe"
    en évitant une policy `UPDATE` générique sur `orders`. La policy RLS
    `orders_update_status` (seul endroit du projet où une transition de statut passait par
    un `UPDATE` client direct plutôt qu'une RPC) est supprimée, remplacée par
    `validate_order`/`cancel_order` : **`cancel_order` restaure désormais le stock** via
    une transaction `ADJUSTMENT` par ligne de commande — l'ancienne limite connue
    "l'annulation ne restaure pas le stock" est corrigée.

13. **Comptabilité : écritures automatiques** (`0010_chart_of_accounts.sql`,
    `0011_accounting_entries.sql`) : dernier maillon de la chaîne. **Automatisation
    simplifiée, pas une comptabilité SYSCOHADA certifiée complète — à faire valider par un
    comptable avant tout usage officiel/fiscal.** `chart_of_accounts` (plan comptable,
    scopé société, bootstrap de 5 comptes : 401 Fournisseurs, 411 Clients, 521 Banques,
    601 Achats de marchandises, 701 Ventes de marchandises) + `journal_entries`/
    `journal_entry_lines` (grand livre, **append-only** comme `transactions`/`logs` —
    correction par contre-passation, jamais par réécriture). L'équilibre débit = crédit
    par écriture est garanti par un trigger de contrainte différée
    (`trg_check_journal_entry_balance`), pas seulement par la RPC appelante. Écritures
    générées automatiquement, dans la même transaction que l'effet métier, par
    `receive_purchase` (601/401), `create_order` (411/701), `cancel_order`
    (contre-passation 701/411) et `record_payment` (521/411, sur le delta de
    `amount_paid`) — **aucune saisie manuelle d'écriture dans cette passe**
    (`journal_entries`/`journal_entry_lines` n'ont aucune policy RLS d'écriture).
    **Production et Transformation sont délibérément exclues** : `production_items
    .unit_cost` / `transformation_outputs.unit_cost` ne sont que des valeurs par défaut
    reprenant `products.price` (le prix de *vente*, pas un coût de revient calculé) — les
    utiliser produirait des écritures sans sens comptable réel. À traiter une fois une
    méthode de valorisation (CUMP, coût standard...) définie avec l'utilisateur. Les
    états financiers (bilan, compte de résultat) restent hors périmètre.

14. **TVA** (`0012_vat.sql`) : taux stocké par société (`companies.vat_rate`, défaut 19)
    plutôt que codé en dur dans les RPC — modifiable directement en base sans nouvelle
    migration, mais sans écran de configuration dans cette passe (limite connue, cf.
    ci-dessous). Important : le document fourni par l'utilisateur (Ordonnance N°2025-44,
    Loi de Finances Niger 2026) **ne fixe pas lui-même le taux de TVA** — il ne modifie
    que les articles d'exonération (Art. 322) et d'exclusion du droit à déduction
    (Art. 339) du Code Général des Impôts existant ; l'article fixant le taux de base
    n'est pas parmi les articles modifiés. Le taux de 19% et l'absence d'exonération
    applicable ont été confirmés directement par l'utilisateur, pas déduits du document.
    `products.price`/`purchase_items.unit_cost`/`order_items.unit_price` sont traités
    comme des montants **HT** ; `receive_purchase`, `create_order` et `cancel_order`
    calculent la TVA dessus et génèrent une 3ᵉ ligne d'écriture (comptes `4431` TVA
    collectée, `4452` TVA déductible, bootstrap comme les 5 comptes de la Phase 4). Les
    pages de détail achat/commande affichent désormais Sous-total HT / TVA / Total TTC.

15. **Export PDF, partage, alertes** (`src/lib/pdf.ts`, `src/lib/share.ts`,
    `src/features/alerts/`) : aucune migration Supabase — tout est calculé/généré côté
    client à partir des données déjà chargées par les pages existantes.
    - **PDF** : `jsPDF` + `jspdf-autotable`, chargées en `import()` dynamique (pas dans le
      bundle principal, seulement au clic sur un bouton PDF) pour ne pas alourdir le
      chargement initial. Disponible sur les factures de vente (commandes), les bons
      d'achat, et l'export complet du journal comptable.
    - **Partage** : bouton "Partager" (`navigator.share` avec fichier) affiché
      uniquement si le navigateur le supporte (`canSharePdf()`) — fiable sur mobile
      (Android Chrome, iOS Safari 15+), support desktop inégal. Le bouton "Télécharger
      le PDF" reste toujours disponible comme repli universel ; WhatsApp/email
      apparaissent dans la feuille de partage système si installés, aucune intégration
      spécifique à ces apps n'est codée.
    - **Alertes** : cloche dans l'en-tête (`AlertsBell.tsx`), badge = stock bas +
      commandes en attente + commandes impayées. Purement calculé (mêmes requêtes que
      `useDashboardStats.ts`), rafraîchi toutes les 60s — aucune notification
      persistée, aucun envoi externe (email/push).

16. **Politique de mots de passe** (`0013_password_policy.sql`,
    `supabase/functions/reset-password/`, `supabase/functions/request-password-reset/`) :
    tout compte créé par l'admin (`create-user`) ou réinitialisé par l'admin
    (`reset-password`) reçoit le mot de passe par défaut partagé
    (`supabase/functions/_shared/constants.ts`, `saheldor2026`) — jamais transmis ni
    connu du frontend, jamais choisi par l'admin. `public.users.must_change_password`
    (défaut `true` sur toute nouvelle ligne, `false` en rétroactif sur les comptes déjà
    actifs au moment de la migration) force le changement dès la première connexion
    (`ProtectedRoute.tsx` redirige vers `/force-password-change` tant que le flag est
    vrai) ; un trigger sur `auth.users` (`trg_clear_must_change_password`, même patron
    que `handle_new_user`) le repasse à `false` automatiquement dès que le mot de passe
    change réellement, quel que soit le chemin. **Auto-service "mot de passe oublié" par
    email réservé aux comptes admin** : `request-password-reset` (Edge Function
    publique, appelée avant authentification) vérifie le rôle de l'email visé côté
    serveur avant d'envoyer quoi que ce soit, et répond toujours le même message
    générique — un non-admin ne reçoit jamais d'email, sans que la réponse ne le
    révèle. `redirectTo` est validé contre une liste blanche d'origines
    (`ALLOWED_REDIRECT_ORIGINS`), ce qui corrige au passage le bug rencontré à deux
    reprises en session : le lien de récupération pointait vers `localhost:3000` faute
    de `redirectTo` explicite dans l'appel précédent.
    **Limite de sécurité assumée** : le mot de passe par défaut est une valeur connue et
    partagée, acceptable uniquement parce que le changement est forcé — mais ce garde est
    appliqué côté client (redirection React), pas via RLS. Une donnée reste protégée par
    RLS indépendamment de ce flag ; ce garde protège seulement l'UX/le parcours normal,
    pas un accès direct à l'API par quelqu'un possédant déjà des identifiants valides.

17. **Rôles agribusiness** (`0014_roles_agribusiness.sql`) : le rôle générique `manager`
    (achats + entrepôts + production + transformation + clients + commandes +
    comptabilité en écriture, tout confondu) est éclaté en 4 spécialités — Logistique,
    Commercial, Comptable, Gestionnaire de production — chacune avec un périmètre
    d'écriture précis (voir section "Rôles applicatifs"). `admin` inchangé ; `auditor`
    renommé `controller` (Contrôleur). Renommage **en place** de 3 lignes `roles`
    existantes (`role_id` étant une FK référencée par `users.role_id`, les comptes
    existants héritent automatiquement du bon nouveau rôle, sans script de
    réassignation) + 2 lignes réellement nouvelles (`accounting`,
    `production_manager`). **Bug corrigé au passage** : `logs` n'était filtré par
    aucune société — un contrôleur (ex-auditeur) non-admin voyait les logs de *toutes*
    les sociétés ; désormais scopé à sa propre société comme partout ailleurs. Les
    libellés français sont centralisés dans `src/lib/roles.ts`.

18. **Harmonisation avec le cahier des charges officiel** (`0016_agribusiness_governance.sql`) :
    les 6 rôles de la phase précédente sont éclatés/complétés en 9 profils conformes au
    cahier (voir section "Rôles applicatifs") — Logistique éclaté en Gestionnaire de
    magasin / Responsable des achats / Logistique-Transport, ajout d'un Superviseur
    distinct du Contrôleur. `admin` passe de "accès total" à **strictement lecture
    seule** (sauf gestion des comptes), conformément au cahier. Séparation des tâches
    imposée pour de bon : le cycle de vente est éclaté create (`sales_operator`) →
    validate (`supervisor`, déclenche désormais la sortie de stock + l'écriture
    comptable, déplacées depuis `create_order`) → paiement (`accounting`) ; le cycle
    d'achat sépare création (`purchasing`) et réception physique (`warehouse_manager`,
    déjà le cas côté stock, formalisé côté rôle). `orders` gagne une colonne
    `warehouse_id` (jusqu'ici seulement transmise au payload, jamais persistée —
    nécessaire puisque la sortie de stock n'a plus lieu à la création). Nouvelle
    traçabilité de consultation : RPC `log_page_visit`, appelée à chaque changement de
    page (`src/lib/useLogPageVisit.ts`), journalise dans la même table `logs` que les
    écritures (`action = 'VIEW'`) — volontairement léger (navigation, pas chaque
    requête `SELECT` individuelle).

19. **États financiers** (`0017_financial_statements.sql`, page "États financiers",
    réservée à `admin`/`controller`/`accounting`) : Bilan et Compte de résultat
    SYSCOHADA simplifiés, calculés à la demande côté client à partir du journal
    comptable et des mouvements de stock — aucune nouvelle table. Le référentiel
    comptable est SYSCOHADA (Acte uniforme OHADA relatif au droit comptable) ; la Loi de
    Finances 2026 (Ordonnance N°2025-44, vérifiée intégralement) est un texte
    exclusivement fiscal qui ne fixe aucune structure de bilan et n'apporte rien de plus
    ici. Mécanisme clé : la méthode actuelle (inventaire intermittent — un achat
    réceptionné passe en charge 601 dès la réception, jamais via un compte de stock)
    fait que le Résultat brut (701 − 601) ne reflète pas le stock non vendu ; le
    "Résultat cumulé" du bilan est donc calculé comme `Produits − Charges + Stock
    valorisé à la date de fin`, ce qui garantit **Total Actif = Total Passif par
    construction**, sans écriture de clôture. Le stock est valorisé par un CUMP (coût
    unitaire moyen pondéré) global calculé uniquement à partir des achats réceptionnés
    (coût réel) ; le stock issu uniquement de Production/Transformation (coût factice =
    prix de vente, même limite qu'aux points 13-14) est exclu du total chiffré et listé
    à part ("stock non valorisé"). Le Capital social (`companies.capital_social`, saisi
    manuellement par le Comptable) est une reclassification à l'intérieur des capitaux
    propres déjà équilibrés — aucun apport de trésorerie n'est tracé dans le grand
    livre, donc le "Résultat cumulé" affiché est le résidu qui préserve l'égalité
    Actif = Passif, pas une valeur calculée indépendamment. Compte de résultat calculé
    sur une période choisie (sélecteur de dates, défaut = année en cours) ; le bilan est
    toujours une photo cumulée depuis le début à la date de fin choisie (pas de notion
    de clôture d'exercice dans l'app). Analyse financière : 5 ratios dérivés (résultat
    net, marge commerciale, autonomie financière, liquidité générale, délai moyen de
    règlement clients).

20. **Synthèse du stock disponible** (page "Mouvements de stock") : récapitulatif du
    stock actuel regroupé par produit (total en gras) avec le détail par magasin en
    dessous, trié alphabétiquement, même mise en évidence du stock bas (< 5) que la page
    Produits. Réutilise `product_stocks` (source de vérité déjà tenue à jour par les
    transactions), aucune nouvelle table ni RPC. Deux sélecteurs (Produit, Magasin)
    permettent de filtrer la synthèse sur une seule combinaison ; une ligne "Total
    restant" en bas de tableau reflète la somme du stock affiché après filtrage (donc le
    total général si aucun filtre n'est actif).

21. **Traçabilité des mouvements, transferts entre magasins, rendement**
    (`0018_stock_traceability.sql`) : en réponse à une version affinée du cahier des
    charges (comparaison faite point par point). Trois ajouts :
    - **Provenance / destination** : nouveau champ `transactions.note`, libellé
      dynamique dans le formulaire de mouvement manuel ("Provenance" pour une Entrée,
      "Destination" pour une Sortie, "Motif" pour un Ajustement) ; affiché en colonne
      dans le tableau des mouvements.
    - **Transferts entre magasins** : nouvelle RPC `transfer_stock` (rôles
      `warehouse_manager`/`logistics_transport`, mêmes que l'insertion manuelle
      directe), insère un OUT au magasin source et un IN au magasin destination de
      façon atomique (une seule fonction Postgres), liés par `transfer_group_id` pour
      la traçabilité de la paire ; notes générées automatiquement ("Transfert
      vers/depuis {magasin}"). Le contrôle de stock insuffisant est délégué à la
      contrainte existante `product_stocks.stock >= 0`.
    - **Rendement de transformation** : affiché sur `TransformationsPage`/
      `TransformationDetailPage`, calculé comme `Σ(quantité extrants) /
      Σ(quantité intrants) × 100`. Concerne uniquement les **Transformations** (les
      **Productions** n'ont aucun intrant tracé dans le schéma actuel — c'est un
      enregistrement de récolte/stock initial, pas une transformation, donc la notion
      de rendement ne s'y applique pas). Limite assumée : c'est un ratio de quantités,
      pas un rendement massique réel, faute d'unité de mesure standardisée par produit.

    **Écart assumé et documenté** : le cahier fourni attribue la "validation des
    entrées en stock" au Responsable des achats ; l'app garde ce choix au Gestionnaire
    de magasin (rôle déjà en place depuis la Phase 9), qui est seul en mesure de
    constater physiquement une livraison reçue — décision opérationnelle confirmée
    avec l'utilisateur, aucun changement de code.

22. **Paiements partiels avec historique** (`0019_order_payments.sql`) : nouvelle table
    append-only `order_payments` (`order_id, amount, user_id, created_at`) — chaque
    versement devient une ligne distincte et auditable, plutôt qu'un seul montant
    mutable. `record_payment` change de signature : **`record_payment(order_id,
    amount)`** — le Comptable saisit désormais le montant reçu à l'instant T, plus un
    nouveau total cumulé à calculer mentalement. La fonction calcule elle-même le Total
    TTC de la commande, rejette tout versement qui dépasserait ce total, et recalcule
    automatiquement `payment_status` (`unpaid`/`partial`/`paid`) à partir de la somme des
    paiements. `OrderDetailPage` affiche le "Reste à payer" et une section "Historique
    des paiements" (date, montant, utilisateur).

    **Correction d'un bug comptable découvert au passage** : la génération de l'écriture
    Trésorerie (521/411) à chaque paiement, présente dans les migrations 0011/0012, avait
    été perdue lors de la réécriture des rôles en 0014/0016 — `record_payment` ne faisait
    plus qu'un `UPDATE orders`, sans impact sur le grand livre. Un paiement enregistré ne
    remontait donc jamais au Bilan. Corrigé dans `0019` (l'écriture Trésorerie est de
    nouveau générée à chaque paiement) ; la migration inclut aussi une écriture de
    rattrapage ponctuelle pour l'unique commande historique affectée (32 130 FCFA) et un
    backfill de `order_payments` pour toutes les commandes déjà partiellement/totalement
    payées avant cette migration.

23. **Facture d'avoir transporteur en cas de perte à la réception**
    (`0020_transporters_purchase_losses.sql`, module Transporteurs, page "Pertes
    transport") : nouvelle table `transporters` (même modèle que Fournisseurs/Clients,
    lecture large scopée société, écriture par Gestionnaire de magasin/Logistique-
    Transport) et nouvelle table append-only `purchase_losses`
    (`purchase_id, transporter_id, product_id, quantity_lost, unit_cost, reason`).
    `receive_purchase` change de signature : **`receive_purchase(purchase_id, losses
    jsonb default '[]')`** — la réception d'un achat accepte désormais une quantité
    réellement reçue par ligne (par défaut égale à la quantité commandée) ; si elle est
    réduite, un transporteur devient obligatoire pour cette ligne. Seule la quantité
    effectivement reçue entre en stock ; l'écart devient une ligne `purchase_losses`,
    consultable depuis le détail de l'achat et depuis la page "Pertes transport"
    (transversale, tous achats de la société), avec téléchargement d'une facture d'avoir
    PDF par perte (`generateCreditNotePdf`).

    **Décision assumée** : l'écriture comptable ACHATS (601/401/4452) reste calculée sur
    la **quantité commandée complète**, jamais réduite par la perte — Sahel d'Or doit
    toujours au fournisseur le montant facturé pour la commande passée ; la perte est une
    réclamation séparée contre le transporteur, pas une réduction de la dette
    fournisseur. Cette fonctionnalité reste **documentaire** pour l'instant : aucun compte
    "Transporteurs à recevoir" n'existe dans le plan comptable actuel, donc la facture
    d'avoir n'a aucune contrepartie comptable générée automatiquement (limite à lever si
    un compte dédié est ajouté au plan SYSCOHADA).

24. **Unités de mesure** (`0021_units_decimal_quantities.sql`, `0022_fix_unconverted_product_stocks.sql`,
    `0023_reconcile_sorgho_stock.sql`) :
    Sahel d'Or étant grossiste, les quantités sont désormais en **tonnes** pour les
    céréales/légumineuses/sucre (Riz local, Sorgho, Mil, Niébé, Arachide décortiquée,
    Sucre) et en **carton/bidon** pour l'huile d'arachide, plutôt qu'un décompte de sacs.
    Nouvelle colonne `products.unit` (`tonne`/`carton`/`bidon`/`unité`). Toutes les
    colonnes quantité/stock du schéma sont passées de `integer` à `numeric(12,3)` pour
    accepter des quantités décimales (ex. 2,5 t) — achats, ventes, transferts,
    production, transformation. Le catalogue huile (auparavant un seul produit "bidon
    20L") est éclaté en 5 produits par format réel de conditionnement : carton de 20
    bidons de 1L, carton de 4 bidons de 5L, et bidons simples non emballés de 10L/20L/25L
    (seuls les deux formats carton utilisent l'unité "carton" — les bidons simples ne
    sont pas conditionnés en carton).

    **Conversion du catalogue existant** : nom débarrassé du suffixe "— sac Xkg", prix
    reconverti (`prix_tonne = prix_sac ÷ facteur`), et stock courant rebasé vers la
    nouvelle unité via une transaction `ADJUSTMENT` par ligne de stock concernée (ex. 14
    sacs de 100kg → 1,4 t). **Limite assumée** : l'historique des mouvements *antérieurs*
    à cette migration reste affiché avec son ancien décompte de sacs sous le nouveau
    libellé "t" — seul le stock courant (et tout ce qui est enregistré après la
    migration) est exact dans la nouvelle unité ; cohérent avec l'immutabilité déjà en
    place ailleurs (aucune réécriture de l'historique).

    **Bug préexistant découvert et corrigé au passage** (`0022`) : les produits créés
    directement via le formulaire "Produits" (insert direct, sans passer par une
    transaction) n'ont jamais eu de ligne `product_stocks` — seul `products.stock`
    (total dénormalisé) était renseigné, jamais synchronisé avec la table par magasin qui
    alimente la synthèse de stock. Ces produits étaient donc invisibles sur la page
    "Mouvements de stock" et leur conversion en tonnes a été manquée par la première
    passe de `0021` (qui ne boucle que sur `product_stocks`). Corrigé par `0022` :
    conversion directe de leur `products.stock` + création rétroactive de leur ligne
    `product_stocks` au "Magasin principal".

    **Deuxième désynchronisation découverte** (`0023`) : `products.stock` (total
    dénormalisé) et `product_stocks` (source de vérité par magasin) avaient dérivé d'un
    écart identique de 100 (avant conversion) pour Sorgho dans les deux sociétés — origine
    non élucidée, sans lien avec la conversion d'unité (le trigger met toujours les deux
    tables à jour ensemble). `product_stocks` fait foi car exclusivement alimentée par de
    vraies transactions ; `products.stock` a été réconcilié dessus par `0023`.

    **4 nouveaux produits huile par société ont un prix à 0 FCFA** (carton 1L, carton
    5L, bidon 10L, bidon 25L — seul le bidon 20L existant conserve son prix) : à saisir
    manuellement via la page Produits avant toute utilisation commerciale. Le prix du
    Sucre - brésilien après conversion mécanique (11 100 FCFA/t, dérivé d'un prix de
    démo à 555 FCFA/sac) est probablement à corriger également — aucune valeur n'a été
    inventée au-delà de la conversion arithmétique du prix existant.

    **Seuil "stock bas" recalibré par unité** (`src/lib/stockThreshold.ts`, désormais
    centralisé — il était dupliqué à l'identique dans 4 fichiers) : 1 t, 5 cartons, 5
    bidons, 5 unités — un seuil unique de "5" n'avait plus de sens une fois les tonnes en
    place (5 tonnes n'est pas un stock bas). Le "Total restant" de la synthèse de stock
    et le calcul de "rendement" d'une transformation (Phase 11) sont désormais
    **groupés/gardés par unité** : additionner des tonnes et des cartons n'a pas de sens,
    et un rendement extrants/intrants n'est calculé que si toutes les lignes partagent la
    même unité (affiche "unités différentes" sinon) — un cas réel pour ce métier
    (transformation d'Arachide décortiquée en tonnes vers de l'Huile en cartons/bidons).

25. **Historique des changements de prix** (`0024_product_price_history.sql`) : jusqu'ici
    aucune fonctionnalité ne permettait de modifier le prix d'un produit existant (seule
    la création en fixait un). Nouvelle table append-only `product_price_history`
    (`product_id, old_price, new_price, reason, user_id, created_at`, immuable comme le
    reste du grand livre) et RPC `update_product_price(product_id, new_price, reason)` —
    réservée à `warehouse_manager`/`production_manager` (mêmes rôles que la gestion du
    catalogue depuis la Phase 9), n'insère une ligne d'historique que si le prix change
    réellement. Page "Produits" : bouton "Modifier le prix" (rôles autorisés) et bouton
    "Historique" (tout rôle authentifié) affichant chaque changement — ancien/nouveau
    prix, motif optionnel, auteur, date.

26. **Structure bancaire : Banque d'opération / Banque de fonctionnement**
    (`0025_bank_accounts_restructure.sql`) : le compte 521 (déjà débité par
    l'encaissement client) est renommé "Banque d'opération" ; nouveau compte 522
    "Banque de fonctionnement", destiné à être alimenté par le premier pour couvrir les
    dépenses (paiement fournisseurs, frais généraux). Le journal "TRESORERIE" devient
    "BANQUE" pour les encaissements générés à partir de cette migration (les écritures
    antérieures gardent leur libellé d'origine — pas de réécriture de l'historique) ;
    un journal "CAISSE" est réservé pour une future fonctionnalité de dépenses en
    espèces. **Hors périmètre de cette passe, à cadrer séparément** : aucune
    fonctionnalité ne permet encore de transférer réellement de l'argent entre les deux
    comptes banque, ni d'enregistrer une dépense (paiement fournisseur ou frais
    général) — seule la structure comptable (les 2 comptes, les 2 journaux) est en
    place pour l'instant.

27. **Compte Caisse** (`0026_caisse_account.sql`) : complète la hiérarchie de trésorerie
    — Banque d'opération → Banque de fonctionnement → **Caisse** (571). Destiné à être
    approvisionné par le compte Banque de fonctionnement pour les dépenses en espèces.
    Même limite que le point 26 : structure comptable uniquement, aucun mécanisme de
    ravitaillement ni de dépense en espèces encore implémenté.

## Limites connues / pistes pour la suite

- **Bundle frontend** : ~600 kB non compressé pour le chunk principal (avertissement
  Vite au build) — `jsPDF`/`jspdf-autotable` n'y contribuent pas (chargées en `import()`
  dynamique, dans des chunks séparés téléchargés seulement au clic sur un bouton PDF),
  mais le chunk principal lui-même dépasse déjà le seuil. Un code-splitting par route
  (`React.lazy`) serait pertinent si l'app continue de grossir.
- **Types Supabase écrits à la main** (`src/lib/database.types.ts`) : à régénérer avec
  `npm run db:types` dès que le projet est lié, pour rester synchronisé avec le schéma réel.
- **Comptabilité** : périmètre volontairement réduit (voir points 13-14) — Production/
  Transformation restent hors du grand livre. Ne pas utiliser en l'état pour des
  déclarations fiscales ou un bilan officiel sans revue par un comptable.
- **États financiers sans immobilisations** (point 19) : aucune ligne "Actif immobilisé"
  (véhicules, bâtiments, matériel) — non tracées dans l'app. Le CUMP du stock est un
  coût moyen global, pas recalculé après chaque entrée successive.
- **Taux de TVA sans écran de configuration** : `companies.vat_rate` se modifie
  directement en base (pas d'interface dédiée dans cette passe).
- **Partage de fichier PDF** : dépend du support navigateur de `navigator.share` avec
  fichiers — fiable sur mobile, inégal sur desktop (le bouton n'apparaît que si détecté,
  jamais de bouton cassé, mais pas de partage direct possible partout).
- **Aucun compte utilisateur n'est réellement supprimable dès qu'il s'est connecté au
  moins une fois** : `public.logs` est immuable (`trg_logs_immutable`, aucun `UPDATE`/
  `DELETE` possible), et chaque connexion journalise déjà des entrées `VIEW` qui
  référencent l'utilisateur (`logs.user_id`) — sans compter les écritures qu'il aurait pu
  déclencher (commande, transaction de stock...), elles aussi immuables. `DELETE FROM
  auth.users` échoue alors avec une violation de contrainte de clé étrangère
  (`logs_user_id_fkey` ou équivalent sur `orders`/`transactions`/`purchases`). Aucune
  fonctionnalité de suppression de compte n'existe donc dans l'app, y compris côté admin
  — un compte qu'on ne veut plus voir utilisé doit être neutralisé autrement (ex. le
  réassigner à un rôle sans droit d'écriture) plutôt que supprimé. Contournable
  uniquement en désactivant temporairement `trg_logs_immutable` (et les triggers
  équivalents sur les tables métier concernées) pour purger les entrées liées avant de
  supprimer l'utilisateur — casse alors le principe de traçabilité permanente pour ces
  entrées précises, à réserver à un besoin RGPD explicite plutôt qu'à un simple ménage de
  comptes de test.
- **Un magasin (`warehouses`) n'est pas non plus supprimable dès qu'un mouvement de stock
  l'a référencé** — même mécanisme que pour les comptes utilisateurs. Dès qu'une ligne
  `product_stocks` existe pour ce magasin (créée automatiquement à la première
  transaction, et jamais supprimée même si le stock retombe à 0), `DELETE FROM
  warehouses` échoue avec `product_stocks_warehouse_id_fkey` (et
  `transactions_warehouse_id_fkey` si des mouvements existent directement). Constaté en
  pratique : un magasin de test créé pour vérifier les transferts entre magasins (point
  21) reste bloqué en base pour cette raison, malgré une tentative de suppression.
  Contournable uniquement en désactivant temporairement `trg_transactions_immutable`
  pour purger les mouvements liés avant de supprimer le magasin — même compromis que pour
  les comptes (casse la traçabilité de ces entrées), à réserver à un cas réellement
  justifié plutôt qu'à un simple ménage de données de test.
- **Une commande ou un achat n'est plus supprimable dès qu'il a été validé/réceptionné**
  — même mécanisme, étendu par les points 22-23 : `order_payments` et `purchase_losses`
  sont eux aussi append-only (`fn_block_mutation()`), en plus de `transactions` et
  `journal_entries` déjà immuables depuis la Phase 4. Constaté en pratique lors de la
  vérification des points 22-23 : une commande de test payée et deux achats de test
  réceptionnés (dont un avec perte transporteur) restent tous bloqués en base
  (`transactions_order_id_fkey`, `transactions_purchase_id_fkey`,
  `purchase_losses_transporter_id_fkey`), malgré une tentative de suppression — pour la
  même raison, un transporteur ayant déjà une perte enregistrée n'est pas non plus
  supprimable.
- **Module Ressources Humaines** : mentionné dans une version affinée du cahier des
  charges fournie par l'utilisateur ("gestion des stocks, achats/ventes, production,
  finances et ressources humaines") mais explicitement hors périmètre pour l'instant —
  aucune fiche employé, aucun suivi RH ou paie dans l'app.
- **Un produit créé via le formulaire "Produits" n'obtient toujours pas de ligne
  `product_stocks`** (`useCreateProduct`, insert direct dans `products`, sans passer par
  une transaction) : c'est le bug corrigé rétroactivement en Phase 14 (points 24, `0022`)
  pour les produits existants, mais la cause (le formulaire de création) n'a pas été
  changée — un nouveau produit créé avec un stock initial non nul reproduira le même
  écart (invisible sur la synthèse de stock tant qu'aucun mouvement réel ne le
  concerne). À corriger en insérant aussi une ligne `product_stocks` au magasin par
  défaut lors de la création, si ce cas se represente.
