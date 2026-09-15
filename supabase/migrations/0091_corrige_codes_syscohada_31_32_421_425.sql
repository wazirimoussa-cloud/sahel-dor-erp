-- Corrige 3 écarts confirmés au plan comptable SYSCOHADA révisé (comptes déjà utilisés par
-- de vraies écritures — puisque journal_entry_lines référence account_id, un uuid stable,
-- renuméroter le `code`/`name` d'un compte existant ne touche aucune écriture déjà passée) :
--
--   - 31 "Matières premières" -> 32. Le compte 31 SYSCOHADA est "Marchandises" (cohérent
--     avec 601 "Achats de marchandises" déjà utilisé côté achats) ; les matières premières
--     et fournitures liées sont le compte 32 -- c'est bien ce que create_transformation()
--     y enregistre (stock de matières premières consommées en transformation), un simple
--     décalage d'un cran.
--   - 421 "Personnel — rémunérations dues" -> 422. SYSCOHADA réserve 421 aux avances et
--     acomptes, 422 aux rémunérations dues.
--   - 425 "Personnel — avances et acomptes" -> 421 (voir ci-dessus). Le 425 SYSCOHADA est
--     "Représentants du personnel" (délégués, syndicats) -- sans rapport, pas recréé ici,
--     aucune écriture n'y a jamais été passée.
--
-- Ordre des renumérotations : 421 -> 422 avant 425 -> 421 (unique (company_id, code) sur
-- chart_of_accounts interdirait sinon un doublon transitoire).

update public.chart_of_accounts set code = '422' where code = '421';
update public.chart_of_accounts set code = '421' where code = '425';
update public.chart_of_accounts
  set code = '32', name = 'Matières premières et fournitures liées'
  where code = '31';

-- create_transformation : copie verbatim de 0085_corrige_fallback_prix_unitaire_defaut.sql,
-- seul le code du compte de stock matières premières change (31 -> 32).
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
  v_account_32 uuid;
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
    select id into v_account_32 from public.chart_of_accounts where company_id = v_caller_company and code = '32';
    select id into v_account_36 from public.chart_of_accounts where company_id = v_caller_company and code = '36';
    select id into v_account_601 from public.chart_of_accounts where company_id = v_caller_company and code = '601';

    if v_account_32 is null or v_account_36 is null or v_account_601 is null then
      raise exception 'Plan comptable incomplet pour cette société (comptes 32/36/601 requis)';
    end if;

    insert into public.journal_entries (company_id, journal_code, description, transformation_id)
    values (v_caller_company, 'TRANSFORMATION', 'Transformation #' || left(v_transformation.id::text, 8), v_transformation.id)
    returning id into v_entry_id;

    insert into public.journal_entry_lines (entry_id, account_id, debit, credit) values
      (v_entry_id, v_account_32, v_total_intrant_cost, 0),
      (v_entry_id, v_account_601, 0, v_total_intrant_cost),
      (v_entry_id, v_account_36, v_total_intrant_cost, 0),
      (v_entry_id, v_account_32, 0, v_total_intrant_cost);
  end if;

  return v_transformation;
end;
$$;

-- create_salary_advance : copie verbatim de 0064_avances_salaire.sql, seul le code du
-- compte d'avances change (425 -> 421).
create or replace function public.create_salary_advance(payload jsonb)
returns salary_advances
language plpgsql security definer set search_path = 'public'
as $function$
declare
  v_caller_company uuid := public.current_company_id();
  v_employee public.employees;
  v_amount numeric(12, 2) := (payload ->> 'amount')::numeric;
  v_advance public.salary_advances;
  v_account_421 uuid;
  v_account_522 uuid;
  v_entry_id uuid;
begin
  if not public.has_attribution('paie.gerer') then
    raise exception 'Non autorisé à créer une avance sur salaire';
  end if;

  if v_caller_company is null then
    raise exception 'Aucune société associée à cet utilisateur';
  end if;

  select * into v_employee from public.employees
  where id = (payload ->> 'employee_id')::uuid and company_id = v_caller_company and active = true;
  if v_employee is null then
    raise exception 'Employé introuvable ou inactif pour cette société';
  end if;

  if v_amount is null or v_amount <= 0 then
    raise exception 'Le montant de l''avance doit être positif';
  end if;

  insert into public.salary_advances (company_id, employee_id, amount, advance_date, reason, user_id)
  values (
    v_caller_company, v_employee.id, v_amount,
    coalesce((payload ->> 'advance_date')::date, current_date),
    payload ->> 'reason', auth.uid()
  )
  returning * into v_advance;

  select id into v_account_421 from public.chart_of_accounts where company_id = v_caller_company and code = '421';
  select id into v_account_522 from public.chart_of_accounts where company_id = v_caller_company and code = '522';
  if v_account_421 is null or v_account_522 is null then
    raise exception 'Plan comptable incomplet pour cette société (comptes 421/522 requis)';
  end if;

  insert into public.journal_entries (company_id, journal_code, description)
  values (v_caller_company, 'PAIE', 'Avance sur salaire — ' || v_employee.full_name)
  returning id into v_entry_id;

  insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
  values (v_entry_id, v_account_421, v_amount, 0);
  insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
  values (v_entry_id, v_account_522, 0, v_amount);

  return v_advance;
end;
$function$;

-- create_payslip : copie verbatim de 0064_avances_salaire.sql, comptes rémunérations dues
-- (421 -> 422) et avances (425 -> 421).
create or replace function public.create_payslip(payload jsonb)
returns payslips
language plpgsql security definer set search_path = 'public'
as $function$
declare
  v_caller_company uuid := public.current_company_id();
  v_employee public.employees;
  v_gross numeric(12, 2) := (payload ->> 'gross_salary')::numeric;
  v_pension numeric(12, 2) := coalesce((payload ->> 'pension_withholding')::numeric, 0);
  v_its numeric(12, 2) := coalesce((payload ->> 'its_withholding')::numeric, 0);
  v_advance_id uuid := (payload ->> 'advance_repaid_id')::uuid;
  v_advance public.salary_advances;
  v_advance_amount numeric(12, 2) := 0;
  v_net numeric(12, 2);
  v_payslip public.payslips;
  v_account_661 uuid;
  v_account_422 uuid;
  v_account_431 uuid;
  v_account_447 uuid;
  v_account_421 uuid;
  v_entry_id uuid;
begin
  if not public.has_attribution('paie.gerer') then
    raise exception 'Non autorisé à créer un bulletin de paie';
  end if;

  if v_caller_company is null then
    raise exception 'Aucune société associée à cet utilisateur';
  end if;

  select * into v_employee from public.employees
  where id = (payload ->> 'employee_id')::uuid and company_id = v_caller_company and active = true;
  if v_employee is null then
    raise exception 'Employé introuvable ou inactif pour cette société';
  end if;

  if v_gross is null or v_gross <= 0 then
    raise exception 'Le salaire brut doit être positif';
  end if;
  if v_pension < 0 or v_its < 0 then
    raise exception 'Les retenues ne peuvent pas être négatives';
  end if;

  if v_advance_id is not null then
    select * into v_advance from public.salary_advances
    where id = v_advance_id and company_id = v_caller_company and employee_id = v_employee.id;
    if v_advance is null then
      raise exception 'Avance introuvable pour cet employé';
    end if;
    if exists (select 1 from public.payslips where advance_repaid_id = v_advance.id) then
      raise exception 'Cette avance a déjà été remboursée sur un autre bulletin';
    end if;
    v_advance_amount := v_advance.amount;
  end if;

  if v_pension + v_its + v_advance_amount > v_gross then
    raise exception 'Le total des retenues ne peut pas dépasser le salaire brut';
  end if;

  v_net := v_gross - v_pension - v_its - v_advance_amount;

  insert into public.payslips (
    company_id, employee_id, period, gross_salary, pension_withholding, its_withholding, net_pay,
    advance_repaid_id, user_id
  )
  values (
    v_caller_company, v_employee.id, (payload ->> 'period')::date, v_gross, v_pension, v_its, v_net,
    v_advance_id, auth.uid()
  )
  returning * into v_payslip;

  select id into v_account_661 from public.chart_of_accounts where company_id = v_caller_company and code = '661';
  select id into v_account_422 from public.chart_of_accounts where company_id = v_caller_company and code = '422';
  select id into v_account_431 from public.chart_of_accounts where company_id = v_caller_company and code = '431';
  select id into v_account_447 from public.chart_of_accounts where company_id = v_caller_company and code = '447';
  if v_account_661 is null or v_account_422 is null or v_account_431 is null or v_account_447 is null then
    raise exception 'Plan comptable incomplet pour cette société (comptes 661/422/431/447 requis)';
  end if;
  if v_advance_amount > 0 then
    select id into v_account_421 from public.chart_of_accounts where company_id = v_caller_company and code = '421';
    if v_account_421 is null then
      raise exception 'Plan comptable incomplet pour cette société (compte 421 requis)';
    end if;
  end if;

  insert into public.journal_entries (company_id, journal_code, description, payslip_id)
  values (v_caller_company, 'PAIE', 'Bulletin de paie — ' || v_employee.full_name, v_payslip.id)
  returning id into v_entry_id;

  insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
  values (v_entry_id, v_account_661, v_gross, 0);

  insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
  values (v_entry_id, v_account_422, 0, v_net);

  if v_pension > 0 then
    insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
    values (v_entry_id, v_account_431, 0, v_pension);
  end if;

  if v_its > 0 then
    insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
    values (v_entry_id, v_account_447, 0, v_its);
  end if;

  if v_advance_amount > 0 then
    insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
    values (v_entry_id, v_account_421, 0, v_advance_amount);
  end if;

  return v_payslip;
end;
$function$;
