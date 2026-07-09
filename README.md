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

Le cahier des charges ne détaillait pas les rôles ; voici ceux retenus par défaut
(ajustables via la table `roles` et les policies RLS dans `supabase/migrations/0003_rls_policies.sql`) :

| Rôle | Accès |
|---|---|
| `admin` | Tout, toutes sociétés, gestion des utilisateurs |
| `manager` | Produits, magasins, fournisseurs, achats, clients, stocks, validation/annulation/paiement des commandes, plan comptable (société assignée) |
| `seller` | Création de mouvements de stock et de commandes (société assignée), lecture des magasins/fournisseurs/achats/clients |
| `auditor` | Lecture seule du journal d'audit et du journal comptable |

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
   n'est pas du RBAC. Ici chaque table distingue admin / manager / seller / auditor et
   scope par `company_id` (multi-société).

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

## Limites connues / pistes pour la suite

- **Bundle frontend** : ~530 kB non compressé (avertissement Vite au build). Un
  code-splitting par route (`React.lazy`) serait pertinent si l'app grossit.
- **Types Supabase écrits à la main** (`src/lib/database.types.ts`) : à régénérer avec
  `npm run db:types` dès que le projet est lié, pour rester synchronisé avec le schéma réel.
- **Comptabilité** : périmètre volontairement réduit (voir points 13-14) — Production/
  Transformation et états financiers restent à construire. Ne pas utiliser en l'état pour
  des déclarations fiscales ou un bilan officiel sans revue par un comptable.
- **Taux de TVA sans écran de configuration** : `companies.vat_rate` se modifie
  directement en base (pas d'interface dédiée dans cette passe).
