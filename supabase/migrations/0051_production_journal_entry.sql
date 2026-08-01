-- Écriture comptable pour la Production, jusqu'ici hors du grand livre (voir
-- 0010_chart_of_accounts.sql : "Production et Transformation sont délibérément
-- exclues de cette première passe" -- faute de méthode de valorisation définie avec
-- l'utilisateur, depuis résolue par le prix de revient, points 36-37). Traitement
-- retenu, confirmé avec l'utilisateur : une production brute (récolte) génère une
-- écriture "production stockée" classique SYSCOHADA (débit stock, crédit produit) --
-- la Transformation, elle, reste neutre : c'est un reclassement de stock déjà valorisé
-- à l'achat, pas un nouveau mouvement de valeur, elle ne génère toujours aucune
-- écriture.

alter table public.journal_entries add column production_id uuid references public.productions(id);
create index journal_entries_production_id_idx on public.journal_entries (production_id);

insert into public.chart_of_accounts (company_id, code, name)
select c.id, a.code, a.name
from public.companies c
cross join (
  values
    ('36', 'Stocks de produits en cours et produits finis'),
    ('73', 'Production stockée')
) as a(code, name)
on conflict (company_id, code) do nothing;

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
    v_unit_cost := coalesce((v_item ->> 'unit_cost')::numeric, v_product.price);

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
