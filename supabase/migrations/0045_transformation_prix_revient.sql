-- Étend le prix de revient automatique (0043) aux Transformations : le coût unitaire
-- d'un extrant n'est plus le prix de vente du produit par défaut, mais dérivé du coût
-- réel des intrants effectivement consommés (via stock_lots.unit_cost, qui porte déjà
-- achat + transport/manutention pour un intrant issu d'un achat, ou tout autre coût
-- hérité pour un intrant issu d'une production/transformation antérieure).
--
-- Répartition confirmée avec l'utilisateur pour les transformations à extrants
-- multiples (ex. arachide -> huile + tourteau) : au prorata de la VALEUR MARCHANDE
-- (quantité × prix de vente courant) de chaque extrant, pas de sa quantité -- un
-- prorata de quantité serait incohérent dès que les extrants sont dans des unités
-- différentes (litres d'huile vs kg de tourteau, par exemple).
--
-- Le champ `unit_cost` autrefois accepté en entrée sur chaque extrant (jamais exposé
-- par le formulaire) est retiré : le calcul est désormais entièrement automatique,
-- cohérent avec l'intention de la fonctionnalité.

create or replace function public.create_transformation(payload jsonb)
returns transformations
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_caller_company uuid := public.current_company_id();
  v_warehouse_id uuid := (payload ->> 'warehouse_id')::uuid;
  v_transformation public.transformations;
  v_item jsonb;
  v_product public.products;
  v_quantity numeric(12, 3);
  v_unit_cost numeric(12, 2);
  v_input_ids uuid[] := '{}';
  v_output_ids uuid[] := '{}';
  v_out_transaction_id uuid;
  v_consumed_cost numeric(14, 2);
  v_total_intrant_cost numeric(14, 2) := 0;
  v_total_output_value numeric(14, 2) := 0;
begin
  if not public.has_attribution('transformation.creer') then
    raise exception 'Non autorisé à créer une transformation';
  end if;

  if v_caller_company is null then
    raise exception 'Aucune société associée à cet utilisateur';
  end if;

  if not exists (
    select 1 from public.warehouses w where w.id = v_warehouse_id and w.company_id = v_caller_company
  ) then
    raise exception 'Magasin introuvable pour cette société';
  end if;

  if jsonb_array_length(coalesce(payload -> 'inputs', '[]'::jsonb)) = 0 then
    raise exception 'Une transformation doit comporter au moins un intrant';
  end if;

  if jsonb_array_length(coalesce(payload -> 'outputs', '[]'::jsonb)) = 0 then
    raise exception 'Une transformation doit comporter au moins un extrant';
  end if;

  select array_agg((elem ->> 'product_id')::uuid) into v_input_ids
  from jsonb_array_elements(payload -> 'inputs') as elem;

  select array_agg((elem ->> 'product_id')::uuid) into v_output_ids
  from jsonb_array_elements(payload -> 'outputs') as elem;

  if v_input_ids && v_output_ids then
    raise exception 'Un même produit ne peut pas être à la fois intrant et extrant d''une transformation';
  end if;

  insert into public.transformations (company_id, warehouse_id, user_id)
  values (v_caller_company, v_warehouse_id, auth.uid())
  returning * into v_transformation;

  for v_item in select * from jsonb_array_elements(payload -> 'inputs')
  loop
    select * into v_product from public.products where id = (v_item ->> 'product_id')::uuid;

    if v_product is null or v_product.company_id <> v_caller_company then
      raise exception 'Produit % introuvable pour cette société', v_item ->> 'product_id';
    end if;

    v_quantity := (v_item ->> 'quantity')::numeric;

    insert into public.transformation_inputs (transformation_id, product_id, quantity)
    values (v_transformation.id, v_product.id, v_quantity);

    insert into public.transactions (product_id, type, quantity, user_id, warehouse_id, transformation_id)
    values (v_product.id, 'OUT', v_quantity, auth.uid(), v_warehouse_id, v_transformation.id)
    returning id into v_out_transaction_id;

    select coalesce(sum(tla.quantity * sl.unit_cost), 0) into v_consumed_cost
    from public.transaction_lot_allocations tla
    join public.stock_lots sl on sl.id = tla.lot_id
    where tla.transaction_id = v_out_transaction_id;

    v_total_intrant_cost := v_total_intrant_cost + v_consumed_cost;
  end loop;

  select coalesce(sum((elem ->> 'quantity')::numeric * coalesce(p.price, 0)), 0) into v_total_output_value
  from jsonb_array_elements(payload -> 'outputs') as elem
  join public.products p on p.id = (elem ->> 'product_id')::uuid;

  for v_item in select * from jsonb_array_elements(payload -> 'outputs')
  loop
    select * into v_product from public.products where id = (v_item ->> 'product_id')::uuid;

    if v_product is null or v_product.company_id <> v_caller_company then
      raise exception 'Produit % introuvable pour cette société', v_item ->> 'product_id';
    end if;

    v_quantity := (v_item ->> 'quantity')::numeric;

    if v_total_output_value > 0 then
      v_unit_cost := v_total_intrant_cost * coalesce(v_product.price, 0) / v_total_output_value;
    else
      v_unit_cost := v_product.price;
    end if;

    insert into public.transformation_outputs (transformation_id, product_id, quantity, unit_cost)
    values (v_transformation.id, v_product.id, v_quantity, v_unit_cost);

    insert into public.transactions (product_id, type, quantity, user_id, warehouse_id, transformation_id, expiry_date)
    values (v_product.id, 'IN', v_quantity, auth.uid(), v_warehouse_id, v_transformation.id, (v_item ->> 'expiry_date')::date);
  end loop;

  return v_transformation;
end;
$$;
