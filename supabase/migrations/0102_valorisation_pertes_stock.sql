-- Valorise les pertes de stock approuvées, à partir du coût FEFO réel déjà tracé par
-- transaction_lot_allocations/stock_lots (0037/0067) -- jamais exploité jusqu'ici pour
-- les pertes de stock (stock_loss_requests, 0031/0067/0078). Objectif : rendre visible
-- une "Pertes sur stock" explicite dans le compte de résultat, sans ajouter d'écriture
-- comptable -- la valeur est déjà correctement reflétée dans le résultat net aujourd'hui
-- via la variation de stock (calculée dynamiquement, CUMP par lot), juste invisible en
-- tant que telle (indiscernable d'une sortie de vente ordinaire).
--
-- Deux cas :
--   - Perte sèche (repackaged_quantity null) : stock_loss_requests.transaction_id pointe
--     directement la transaction ADJUSTMENT -- coût = somme des allocations de lots de
--     cette transaction.
--   - Reconditionnement (repackaged_quantity renseigné) : approve_stock_loss crée une
--     transformation (intrant = extrant, même produit). La perte réelle = coût de
--     l'intrant consommé (transaction OUT de cette transformation) moins la valeur de
--     l'extrant récupéré (transformation_outputs, valorisé au prix de revient fixe du
--     produit -- voir 0078_fix_price_reconditionnement.sql).
--
-- security_invoker : la vue respecte directement les RLS des tables sous-jacentes
-- (stock_loss_requests_select, stock_lots_select, transaction_lot_allocations_select,
-- transformation_outputs_select, toutes déjà scopées société) -- pas de policy dédiée à
-- écrire ni à maintenir en double.
create view public.v_stock_loss_valued
with (security_invoker = true)
as
select
  slr.id,
  slr.company_id,
  slr.reviewed_at,
  case
    when slr.repackaged_quantity is null then
      coalesce((
        select sum(tla.quantity * sl.unit_cost)
        from public.transaction_lot_allocations tla
        join public.stock_lots sl on sl.id = tla.lot_id
        where tla.transaction_id = slr.transaction_id
      ), 0)
    else
      coalesce((
        select sum(tla.quantity * sl.unit_cost)
        from public.transactions t
        join public.transaction_lot_allocations tla on tla.transaction_id = t.id
        join public.stock_lots sl on sl.id = tla.lot_id
        where t.transformation_id = slr.transformation_id and t.type = 'OUT'
      ), 0)
      - coalesce((
        select sum(tof.quantity * tof.unit_cost)
        from public.transformation_outputs tof
        where tof.transformation_id = slr.transformation_id
      ), 0)
  end as loss_value
from public.stock_loss_requests slr
where slr.status = 'approved';

grant select on public.v_stock_loss_valued to authenticated;
