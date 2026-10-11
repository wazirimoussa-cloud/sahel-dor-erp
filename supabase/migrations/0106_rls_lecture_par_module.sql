-- RLS par module en LECTURE (chantier 4 du plan de remédiation, README point 116).
--
-- Jusqu'ici ces tables ne filtraient que par société : n'importe quel compte (vendeur,
-- magasinier...) pouvait lire toutes les commandes, achats, productions ou pertes de sa
-- société en appelant l'API directement, la garde requiredModule du frontend n'étant
-- qu'une garde de navigation. Les écritures étaient déjà protégées (RPC security definer
-- + attributions) ; seules les policies SELECT changent ici.
--
-- Règle : une table n'est lisible qu'avec le module qui l'exploite, en plus du filtre
-- société. Les tables enfants répètent la condition explicitement (plutôt que de compter
-- sur la RLS du parent évaluée dans leur sous-requête) pour qu'une policy se lise seule.
--
--   orders (+ order_items, order_payments)            -> ventes
--   purchases (+ items, losses, recoveries, write-offs,
--              transport payments)                     -> achats OU transporteurs
--   stock_loss_requests                                -> pertes_stock OU un module
--                                                          comptable (voir ci-dessous)
--   productions (+ production_items)                   -> production
--   transformations (+ inputs, outputs)                -> transformation
--
-- stock_loss_requests reste lisible par les modules comptables : la vue
-- v_stock_loss_valued (0102, security_invoker) alimente le bilan et le tableau de bord
-- Finance -- sans cela leurs montants seraient faux sans aucune erreur visible.
--
-- Volontairement NON restreint : transactions, stock_lots, product_stocks (et products).
-- L'écran Stock et la cloche d'alertes sont ouverts à tous par conception, et les niveaux
-- de stock sont lus par la vente (vérification avant validation), les pertes, les
-- entrepôts et le bilan. user_attributions est déjà verrouillée (0101).
--
-- Tableaux de bord : décision du propriétaire (2026-10-11) -- une tuile qui lit un module
-- que le profil n'a pas DISPARAÎT (pas de RPC d'agrégat). Côté frontend, les tuiles
-- concernées sont masquées par hasModuleAccess() pour ne jamais afficher un faux zéro.
--
-- (select fn()) plutôt que fn() : évalué une fois par requête (initPlan) au lieu d'une
-- fois par ligne -- has_module_access/current_company_id sont stable mais pas immutable.
--
-- Vérification après `db push` (voir README point 116) : chaque profil de test Formation
-- doit continuer de voir ses propres écrans, et 0 ligne sur les tables hors module.

-- ============================================================================
-- Ventes
-- ============================================================================

drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders
  for select to authenticated
  using (
    company_id = (select public.current_company_id())
    and (select public.has_module_access('ventes'))
  );

drop policy if exists order_items_select on public.order_items;
create policy order_items_select on public.order_items
  for select to authenticated
  using (
    (select public.has_module_access('ventes'))
    and exists (
      select 1 from public.orders o
      where o.id = order_items.order_id and o.company_id = (select public.current_company_id())
    )
  );

drop policy if exists order_payments_select on public.order_payments;
create policy order_payments_select on public.order_payments
  for select to authenticated
  using (
    (select public.has_module_access('ventes'))
    and exists (
      select 1 from public.orders o
      where o.id = order_payments.order_id and o.company_id = (select public.current_company_id())
    )
  );

-- ============================================================================
-- Achats / transport
-- ============================================================================

drop policy if exists purchases_select on public.purchases;
create policy purchases_select on public.purchases
  for select to authenticated
  using (
    company_id = (select public.current_company_id())
    and ((select public.has_module_access('achats')) or (select public.has_module_access('transporteurs')))
  );

drop policy if exists purchase_items_select on public.purchase_items;
create policy purchase_items_select on public.purchase_items
  for select to authenticated
  using (
    ((select public.has_module_access('achats')) or (select public.has_module_access('transporteurs')))
    and exists (
      select 1 from public.purchases p
      where p.id = purchase_items.purchase_id and p.company_id = (select public.current_company_id())
    )
  );

drop policy if exists purchase_losses_select on public.purchase_losses;
create policy purchase_losses_select on public.purchase_losses
  for select to authenticated
  using (
    ((select public.has_module_access('achats')) or (select public.has_module_access('transporteurs')))
    and exists (
      select 1 from public.purchases p
      where p.id = purchase_losses.purchase_id and p.company_id = (select public.current_company_id())
    )
  );

drop policy if exists purchase_loss_recoveries_select on public.purchase_loss_recoveries;
create policy purchase_loss_recoveries_select on public.purchase_loss_recoveries
  for select to authenticated
  using (
    ((select public.has_module_access('achats')) or (select public.has_module_access('transporteurs')))
    and exists (
      select 1
      from public.purchase_losses pl
      join public.purchases p on p.id = pl.purchase_id
      where pl.id = purchase_loss_recoveries.purchase_loss_id
        and p.company_id = (select public.current_company_id())
    )
  );

drop policy if exists purchase_loss_writeoffs_select on public.purchase_loss_writeoffs;
create policy purchase_loss_writeoffs_select on public.purchase_loss_writeoffs
  for select to authenticated
  using (
    ((select public.has_module_access('achats')) or (select public.has_module_access('transporteurs')))
    and exists (
      select 1
      from public.purchase_losses pl
      join public.purchases p on p.id = pl.purchase_id
      where pl.id = purchase_loss_writeoffs.purchase_loss_id
        and p.company_id = (select public.current_company_id())
    )
  );

drop policy if exists purchase_transport_payments_select on public.purchase_transport_payments;
create policy purchase_transport_payments_select on public.purchase_transport_payments
  for select to authenticated
  using (
    ((select public.has_module_access('achats')) or (select public.has_module_access('transporteurs')))
    and exists (
      select 1 from public.purchases p
      where p.id = purchase_transport_payments.purchase_id
        and p.company_id = (select public.current_company_id())
    )
  );

-- ============================================================================
-- Pertes de stock
-- ============================================================================

drop policy if exists stock_loss_requests_select on public.stock_loss_requests;
create policy stock_loss_requests_select on public.stock_loss_requests
  for select to authenticated
  using (
    company_id = (select public.current_company_id())
    and (
      (select public.has_module_access('pertes_stock'))
      or (select public.has_module_access('comptabilite'))
      or (select public.has_module_access('etats_financiers'))
      or (select public.has_module_access('journal_comptable'))
    )
  );

-- ============================================================================
-- Production / transformation
-- ============================================================================

drop policy if exists productions_select on public.productions;
create policy productions_select on public.productions
  for select to authenticated
  using (
    company_id = (select public.current_company_id())
    and (select public.has_module_access('production'))
  );

drop policy if exists production_items_select on public.production_items;
create policy production_items_select on public.production_items
  for select to authenticated
  using (
    (select public.has_module_access('production'))
    and exists (
      select 1 from public.productions p
      where p.id = production_items.production_id and p.company_id = (select public.current_company_id())
    )
  );

drop policy if exists transformations_select on public.transformations;
create policy transformations_select on public.transformations
  for select to authenticated
  using (
    company_id = (select public.current_company_id())
    and (select public.has_module_access('transformation'))
  );

drop policy if exists transformation_inputs_select on public.transformation_inputs;
create policy transformation_inputs_select on public.transformation_inputs
  for select to authenticated
  using (
    (select public.has_module_access('transformation'))
    and exists (
      select 1 from public.transformations t
      where t.id = transformation_inputs.transformation_id and t.company_id = (select public.current_company_id())
    )
  );

drop policy if exists transformation_outputs_select on public.transformation_outputs;
create policy transformation_outputs_select on public.transformation_outputs
  for select to authenticated
  using (
    (select public.has_module_access('transformation'))
    and exists (
      select 1 from public.transformations t
      where t.id = transformation_outputs.transformation_id and t.company_id = (select public.current_company_id())
    )
  );
