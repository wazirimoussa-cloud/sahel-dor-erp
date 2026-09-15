-- Corrige un bug réel trouvé en vérification live (perte constatée à la réception affichant
-- une valeur ~130x à ~1500x trop élevée sur Formation) : create_purchase(), create_production()
-- et create_transformation() utilisaient products.purchase_cost comme prix PAR DÉFAUT d'une
-- ligne quand l'appelant ne précise pas de unit_cost -- or purchase_cost est documenté comme
-- un coût GLOBAL (0075_prix_de_revient_produit.sql : "Prix global d'achat (coût total
-- d'acquisition), saisi à la création du produit"), pas un prix unitaire. products.unit_cost
-- ("prix de revient") est la vraie valeur par unité, déjà calculée comme
-- (purchase_cost + freight_cost + handling_cost) / stock initial -- c'est LUI le bon fallback.
--
-- Impact réel : aucun écran de saisie (NewPurchaseForm.tsx, NewProductionForm.tsx,
-- NewTransformationForm.tsx) ne propose de champ prix par ligne -- ce fallback se déclenchait
-- donc systématiquement, à chaque bon d'achat/production créés via l'UI normale. Vérifié :
-- Production n'a encore aucune ligne purchase_items (aucun bon d'achat créé depuis la remise
-- à blanc du 01/08) -- aucune écriture comptable réelle corrompue, seule Formation (données de
-- test) est affectée par des montants historiques déjà passés.
--
-- Correctif volontairement minimal (confirmé avec l'utilisateur) : seul le fallback change,
-- rien d'autre dans ces trois fonctions -- copie verbatim de leur dernière définition
-- (0076_retrait_frais_achat.sql pour create_purchase, 0075_prix_de_revient_produit.sql pour
-- create_production/create_transformation) à l'exception de la ligne corrigée.

create or replace function public.create_purchase(payload jsonb)
returns purchases
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_caller_company uuid := public.current_company_id();
  v_supplier_id uuid := (payload ->> 'supplier_id')::uuid;
  v_warehouse_id uuid := (payload ->> 'warehouse_id')::uuid;
  v_purchase public.purchases;
  v_item jsonb;
  v_product public.products;
begin
  if not public.has_attribution('achats.creer') then
    raise exception 'Non autorisé à créer un achat';
  end if;

  if v_caller_company is null then
    raise exception 'Aucune société associée à cet utilisateur';
  end if;

  if not exists (
    select 1 from public.suppliers s where s.id = v_supplier_id and s.company_id = v_caller_company
  ) then
    raise exception 'Fournisseur introuvable pour cette société';
  end if;

  if not exists (
    select 1 from public.warehouses w where w.id = v_warehouse_id and w.company_id = v_caller_company
  ) then
    raise exception 'Magasin introuvable pour cette société';
  end if;

  insert into public.purchases (company_id, supplier_id, warehouse_id, user_id, status)
  values (v_caller_company, v_supplier_id, v_warehouse_id, auth.uid(), 'pending')
  returning * into v_purchase;

  for v_item in select * from jsonb_array_elements(payload -> 'items')
  loop
    select * into v_product from public.products where id = (v_item ->> 'product_id')::uuid;

    if v_product is null or v_product.company_id <> v_caller_company then
      raise exception 'Produit % introuvable pour cette société', v_item ->> 'product_id';
    end if;

    insert into public.purchase_items (purchase_id, product_id, quantity, unit_cost)
    values (
      v_purchase.id,
      v_product.id,
      (v_item ->> 'quantity')::numeric,
      coalesce((v_item ->> 'unit_cost')::numeric, v_product.unit_cost)
    );
  end loop;

  return v_purchase;
end;
$$;

create or replace function public.create_production(payload jsonb)
returns productions
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_caller_company uuid := public.current_company_id();
  v_warehouse_id uuid := (payload ->> 'warehouse_id')::uuid;
  v_production public.productions;
  v_item jsonb;
  v_product public.products;
  v_quantity numeric(12, 3);
  v_unit_cost numeric(12, 2);
  v_total_value numeric(14, 2) := 0;
  v_account_36 uuid;
  v_account_73 uuid;
  v_entry_id uuid;
begin
  if not public.has_attribution('production.creer') then
    raise exception 'Non autorisé à créer une production';
  end if;

  if v_caller_company is null then
    raise exception 'Aucune société associée à cet utilisateur';
  end if;

  if not exists (
    select 1 from public.warehouses w where w.id = v_warehouse_id and w.company_id = v_caller_company
  ) then
    raise exception 'Magasin introuvable pour cette société';
  end if;

  if jsonb_array_length(coalesce(payload -> 'items', '[]'::jsonb)) = 0 then
    raise exception 'Une production doit comporter au moins une ligne';
  end if;

  insert into public.productions (company_id, warehouse_id, user_id)
  values (v_caller_company, v_warehouse_id, auth.uid())
  returning * into v_production;

  for v_item in select * from jsonb_array_elements(payload -> 'items')
  loop
    select * into v_product from public.products where id = (v_item ->> 'product_id')::uuid;

    if v_product is null or v_product.company_id <> v_caller_company then
      raise exception 'Produit % introuvable pour cette société', v_item ->> 'product_id';
    end if;

    v_quantity := (v_item ->> 'quantity')::numeric;
    v_unit_cost := coalesce((v_item ->> 'unit_cost')::numeric, v_product.unit_cost);

    insert into public.production_items (production_id, product_id, quantity, unit_cost)
    values (v_production.id, v_product.id, v_quantity, v_unit_cost);

    insert into public.transactions (product_id, type, quantity, user_id, warehouse_id, production_id, expiry_date)
    values (v_product.id, 'IN', v_quantity, auth.uid(), v_warehouse_id, v_production.id, (v_item ->> 'expiry_date')::date);

    v_total_value := v_total_value + (v_quantity * v_unit_cost);
  end loop;

  if v_total_value > 0 then
    select id into v_account_36 from public.chart_of_accounts where company_id = v_caller_company and code = '36';
    select id into v_account_73 from public.chart_of_accounts where company_id = v_caller_company and code = '73';

    if v_account_36 is null or v_account_73 is null then
      raise exception 'Plan comptable incomplet pour cette société (comptes 36/73 requis)';
    end if;

    insert into public.journal_entries (company_id, journal_code, description, production_id)
    values (v_caller_company, 'PRODUCTION', 'Production #' || left(v_production.id::text, 8), v_production.id)
    returning id into v_entry_id;

    insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
    values (v_entry_id, v_account_36, v_total_value, 0);

    insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
    values (v_entry_id, v_account_73, 0, v_total_value);
  end if;

  return v_production;
end;
$function$;

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
  v_account_31 uuid;
  v_account_36 uuid;
  v_account_601 uuid;
  v_entry_id uuid;
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

  select coalesce(sum((elem ->> 'quantity')::numeric * coalesce(p.selling_price, 0)), 0) into v_total_output_value
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
      v_unit_cost := v_total_intrant_cost * coalesce(v_product.selling_price, 0) / v_total_output_value;
    else
      v_unit_cost := v_product.unit_cost;
    end if;

    insert into public.transformation_outputs (transformation_id, product_id, quantity, unit_cost)
    values (v_transformation.id, v_product.id, v_quantity, v_unit_cost);

    insert into public.transactions (product_id, type, quantity, user_id, warehouse_id, transformation_id, expiry_date)
    values (v_product.id, 'IN', v_quantity, auth.uid(), v_warehouse_id, v_transformation.id, (v_item ->> 'expiry_date')::date);
  end loop;

  if v_total_intrant_cost > 0 then
    select id into v_account_31 from public.chart_of_accounts where company_id = v_caller_company and code = '31';
    select id into v_account_36 from public.chart_of_accounts where company_id = v_caller_company and code = '36';
    select id into v_account_601 from public.chart_of_accounts where company_id = v_caller_company and code = '601';

    if v_account_31 is null or v_account_36 is null or v_account_601 is null then
      raise exception 'Plan comptable incomplet pour cette société (comptes 31/36/601 requis)';
    end if;

    insert into public.journal_entries (company_id, journal_code, description, transformation_id)
    values (v_caller_company, 'TRANSFORMATION', 'Transformation #' || left(v_transformation.id::text, 8), v_transformation.id)
    returning id into v_entry_id;

    insert into public.journal_entry_lines (entry_id, account_id, debit, credit) values
      (v_entry_id, v_account_31, v_total_intrant_cost, 0),
      (v_entry_id, v_account_601, 0, v_total_intrant_cost),
      (v_entry_id, v_account_36, v_total_intrant_cost, 0),
      (v_entry_id, v_account_31, 0, v_total_intrant_cost);
  end if;

  return v_transformation;
end;
$$;
