-- Écriture de reclassement pour les Transformations, demandée par le comptable du
-- client (0010/0051 documentaient jusqu'ici l'absence délibérée d'écriture : "reclassement
-- de stock déjà valorisé à l'achat, pas un nouveau mouvement de valeur"). Reste vrai
-- ici : aucune valeur nouvelle n'est reconnue (contrairement à la Production, qui crédite
-- 73 "Production stockée" pour de la valeur réellement créée) -- cette écriture ne fait
-- que reprendre une charge déjà comptabilisée (601, à l'achat) et la reclasser en stock,
-- via un nouveau compte "Matières premières" (31) qui n'existait pas jusqu'ici.
--
-- Reconnu explicitement avec l'utilisateur : ceci améliore le suivi analytique/la
-- traçabilité des achats transformés, mais NE REMPLACE PAS une comptabilité en stock
-- complète (inventaire permanent ou intermittent) -- le compte 601 continue d'être
-- débité en totalité à CHAQUE achat (voir 0010/0011), y compris pour la part qui sera
-- plus tard transformée ; cette écriture se contente de reclasser après coup la
-- fraction concernée. Elle n'a par ailleurs aucun effet sur le Bilan/Compte de résultat
-- calculés par useFinancialStatements.ts, qui ne lit jamais les comptes 31/36 (même
-- précédent que 73 pour la Production, jamais lu non plus) -- uniquement visible dans
-- le Journal comptable et le Plan comptable, sans risque de double comptage dans les
-- totaux déjà affichés ailleurs dans l'app.
--
-- Écriture à 4 lignes, équilibrée :
--   débit  31 (Matières premières)                  = coût des intrants consommés
--   crédit 601 (Achats de marchandises)              = coût des intrants consommés
--   débit  36 (Stocks produits en cours et finis)    = même montant (valeur des extrants,
--                                                       identique par construction à la
--                                                       valeur des intrants -- 0045)
--   crédit 31 (Matières premières)                   = coût des intrants consommés

alter table public.journal_entries add column transformation_id uuid references public.transformations(id);
create index journal_entries_transformation_id_idx on public.journal_entries (transformation_id);

insert into public.chart_of_accounts (company_id, code, name)
select c.id, a.code, a.name
from public.companies c
cross join (
  values
    ('31', 'Matières premières')
) as a(code, name)
on conflict (company_id, code) do nothing;

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
