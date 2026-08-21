-- Corrige une deuxième régression manquée par 0075_prix_de_revient_produit.sql : le
-- flux de reconditionnement dans approve_stock_loss() (transformation intrant=extrant
-- du même produit) lisait encore `products.price` en dur dans un SELECT, invisible aux
-- recherches précédentes (identifiant nu "price", pas "v_product.price" ni
-- "products.price"). Découvert via la suite d'intégration (stock-and-assets.test.ts,
-- "un reconditionnement approuvé génère une transformation intrant=extrant").
--
-- Choix du remplacement : products.unit_cost (le prix de revient fixe du produit) plutôt
-- que selling_price -- un reconditionnement transforme le produit en lui-même, la seule
-- valeur de coût pertinente pour valoriser l'extrant est le prix de revient, pas un
-- prix de vente qui n'a jamais eu de rôle logique ici (c'était déjà un choix approximatif
-- avant cette migration, products.price étant alors le seul champ de coût disponible).
--
-- Corps repris À L'IDENTIQUE de 0067_pertes_stock_lot_cible.sql, seule la ligne du
-- SELECT (price -> unit_cost) change.

create or replace function public.approve_stock_loss(p_request_id uuid)
returns public.stock_loss_requests
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_company uuid := public.current_company_id();
  v_request public.stock_loss_requests;
  v_transaction_id uuid;
  v_transformation public.transformations;
  v_out_transaction_id uuid;
  v_expiry_date date;
begin
  if not public.has_attribution('pertes_stock.approuver') then
    raise exception 'Non autorisé à approuver une perte de stock';
  end if;

  select * into v_request from public.stock_loss_requests
  where id = p_request_id and company_id = v_company and status = 'pending'
  for update;

  if v_request is null then
    raise exception 'Demande introuvable ou déjà traitée';
  end if;

  if v_request.repackaged_quantity is null then
    insert into public.transactions (product_id, type, quantity, user_id, warehouse_id, note, target_lot_id)
    values (
      v_request.product_id, 'ADJUSTMENT', -v_request.quantity, v_request.requested_by,
      v_request.warehouse_id, v_request.reason, v_request.lot_id
    )
    returning id into v_transaction_id;

    update public.stock_loss_requests
    set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), transaction_id = v_transaction_id
    where id = p_request_id
    returning * into v_request;
  else
    insert into public.transformations (company_id, warehouse_id, user_id)
    values (v_company, v_request.warehouse_id, v_request.requested_by)
    returning * into v_transformation;

    insert into public.transformation_inputs (transformation_id, product_id, quantity)
    values (v_transformation.id, v_request.product_id, v_request.quantity);

    insert into public.transactions (product_id, type, quantity, user_id, warehouse_id, transformation_id, target_lot_id)
    values (
      v_request.product_id, 'OUT', v_request.quantity, v_request.requested_by,
      v_request.warehouse_id, v_transformation.id, v_request.lot_id
    )
    returning id into v_out_transaction_id;

    select min(sl.expiry_date) filter (where sl.expiry_date is not null)
    into v_expiry_date
    from public.transaction_lot_allocations tla
    join public.stock_lots sl on sl.id = tla.lot_id
    where tla.transaction_id = v_out_transaction_id;

    insert into public.transformation_outputs (transformation_id, product_id, quantity, unit_cost)
    select v_transformation.id, v_request.product_id, v_request.repackaged_quantity, unit_cost
    from public.products where id = v_request.product_id;

    insert into public.transactions (product_id, type, quantity, user_id, warehouse_id, transformation_id, expiry_date)
    values (
      v_request.product_id, 'IN', v_request.repackaged_quantity, v_request.requested_by,
      v_request.warehouse_id, v_transformation.id, v_expiry_date
    );

    update public.stock_loss_requests
    set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), transformation_id = v_transformation.id
    where id = p_request_id
    returning * into v_request;
  end if;

  return v_request;
end;
$$;
