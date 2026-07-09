-- TVA (19% par défaut, sans exonération pour cette activité — confirmé par l'utilisateur
-- après relecture de l'Ordonnance N°2025-44/Loi de Finances 2026, qui ne fixe pas
-- elle-même le taux : elle ne modifie que les articles d'exonération et d'exclusion du
-- droit à déduction du Code Général des Impôts existant).
--
-- Les montants déjà saisis (products.price, purchase_items.unit_cost,
-- order_items.unit_price) sont traités comme des montants HT — la TVA est calculée et
-- ajoutée dessus, jamais extraite. Taux stocké par société (companies.vat_rate), pas
-- codé en dur dans les RPC, pour rester ajustable sans nouvelle migration.

alter table public.companies add column vat_rate numeric(5, 2) not null default 19;

-- Bootstrap : 2 comptes supplémentaires par société existante, mêmes mécanique que les 5
-- comptes de la Phase 4 (0010).
insert into public.chart_of_accounts (company_id, code, name)
select c.id, a.code, a.name
from public.companies c
cross join (
  values
    ('4431', 'TVA collectée'),
    ('4452', 'TVA déductible')
) as a(code, name);

create or replace function public.receive_purchase(purchase_id uuid)
returns public.purchases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.current_role_name();
  v_caller_company uuid := public.current_company_id();
  v_purchase public.purchases;
  v_item record;
  v_total numeric(14, 2) := 0;
  v_vat_rate numeric(5, 2);
  v_vat numeric(14, 2);
  v_account_601 uuid;
  v_account_401 uuid;
  v_account_4452 uuid;
  v_entry_id uuid;
begin
  if v_role is null or v_role not in ('admin', 'manager') then
    raise exception 'Rôle % non autorisé à réceptionner un achat', coalesce(v_role, '(aucun)');
  end if;

  select * into v_purchase from public.purchases p where p.id = receive_purchase.purchase_id;

  if v_purchase is null then
    raise exception 'Achat introuvable';
  end if;

  if v_role <> 'admin' and v_purchase.company_id is distinct from v_caller_company then
    raise exception 'Impossible de réceptionner un achat d''une autre société';
  end if;

  if v_purchase.status <> 'pending' then
    raise exception 'Seul un achat en attente peut être réceptionné (statut actuel : %)', v_purchase.status;
  end if;

  for v_item in select * from public.purchase_items where purchase_items.purchase_id = v_purchase.id
  loop
    insert into public.transactions (product_id, type, quantity, user_id, warehouse_id, purchase_id)
    values (v_item.product_id, 'IN', v_item.quantity, auth.uid(), v_purchase.warehouse_id, v_purchase.id);

    v_total := v_total + (v_item.quantity * v_item.unit_cost);
  end loop;

  update public.purchases set status = 'received' where id = v_purchase.id
  returning * into v_purchase;

  if v_total > 0 then
    select vat_rate into v_vat_rate from public.companies where id = v_purchase.company_id;
    v_vat := round(v_total * v_vat_rate / 100, 2);

    select id into v_account_601 from public.chart_of_accounts where company_id = v_purchase.company_id and code = '601';
    select id into v_account_401 from public.chart_of_accounts where company_id = v_purchase.company_id and code = '401';
    select id into v_account_4452 from public.chart_of_accounts where company_id = v_purchase.company_id and code = '4452';

    if v_account_601 is null or v_account_401 is null or v_account_4452 is null then
      raise exception 'Plan comptable incomplet pour cette société (comptes 601/401/4452 requis)';
    end if;

    insert into public.journal_entries (company_id, journal_code, description, purchase_id)
    values (v_purchase.company_id, 'ACHATS', 'Réception achat #' || left(v_purchase.id::text, 8), v_purchase.id)
    returning id into v_entry_id;

    insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
    values (v_entry_id, v_account_601, v_total, 0);

    insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
    values (v_entry_id, v_account_4452, v_vat, 0);

    insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
    values (v_entry_id, v_account_401, 0, v_total + v_vat);
  end if;

  return v_purchase;
end;
$$;

create or replace function public.create_order(payload jsonb)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.current_role_name();
  v_caller_company uuid := public.current_company_id();
  v_company_id uuid;
  v_warehouse_id uuid := (payload ->> 'warehouse_id')::uuid;
  v_client_id uuid := (payload ->> 'client_id')::uuid;
  v_order public.orders;
  v_item jsonb;
  v_product public.products;
  v_total numeric(14, 2) := 0;
  v_quantity integer;
  v_vat_rate numeric(5, 2);
  v_vat numeric(14, 2);
  v_account_411 uuid;
  v_account_701 uuid;
  v_account_4431 uuid;
  v_entry_id uuid;
begin
  if v_role is null or v_role not in ('admin', 'manager', 'seller') then
    raise exception 'Rôle % non autorisé à créer une commande', coalesce(v_role, '(aucun)');
  end if;

  v_company_id := coalesce((payload ->> 'company_id')::uuid, v_caller_company);

  if v_role <> 'admin' and v_company_id is distinct from v_caller_company then
    raise exception 'Impossible de créer une commande pour une autre société';
  end if;

  if v_company_id is null then
    raise exception 'Aucune société associée à cet utilisateur';
  end if;

  if not exists (
    select 1 from public.warehouses w where w.id = v_warehouse_id and w.company_id = v_company_id
  ) then
    raise exception 'Magasin introuvable pour cette société';
  end if;

  if not exists (
    select 1 from public.clients c where c.id = v_client_id and c.company_id = v_company_id
  ) then
    raise exception 'Client introuvable pour cette société';
  end if;

  insert into public.orders (company_id, user_id, status, client_id)
  values (v_company_id, auth.uid(), 'pending', v_client_id)
  returning * into v_order;

  for v_item in select * from jsonb_array_elements(payload -> 'items')
  loop
    select * into v_product from public.products where id = (v_item ->> 'product_id')::uuid;

    if v_product is null or v_product.company_id <> v_company_id then
      raise exception 'Produit % introuvable pour cette société', v_item ->> 'product_id';
    end if;

    v_quantity := (v_item ->> 'quantity')::integer;

    insert into public.order_items (order_id, product_id, quantity, unit_price)
    values (v_order.id, v_product.id, v_quantity, v_product.price);

    insert into public.transactions (product_id, type, quantity, user_id, warehouse_id, order_id)
    values (v_product.id, 'OUT', v_quantity, auth.uid(), v_warehouse_id, v_order.id);

    v_total := v_total + (v_quantity * v_product.price);
  end loop;

  if v_total > 0 then
    select vat_rate into v_vat_rate from public.companies where id = v_company_id;
    v_vat := round(v_total * v_vat_rate / 100, 2);

    select id into v_account_411 from public.chart_of_accounts where company_id = v_company_id and code = '411';
    select id into v_account_701 from public.chart_of_accounts where company_id = v_company_id and code = '701';
    select id into v_account_4431 from public.chart_of_accounts where company_id = v_company_id and code = '4431';

    if v_account_411 is null or v_account_701 is null or v_account_4431 is null then
      raise exception 'Plan comptable incomplet pour cette société (comptes 411/701/4431 requis)';
    end if;

    insert into public.journal_entries (company_id, journal_code, description, order_id)
    values (v_company_id, 'VENTES', 'Vente #' || left(v_order.id::text, 8), v_order.id)
    returning id into v_entry_id;

    insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
    values (v_entry_id, v_account_411, v_total + v_vat, 0);

    insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
    values (v_entry_id, v_account_701, 0, v_total);

    insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
    values (v_entry_id, v_account_4431, 0, v_vat);
  end if;

  return v_order;
end;
$$;

create or replace function public.cancel_order(order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.current_role_name();
  v_caller_company uuid := public.current_company_id();
  v_order public.orders;
  v_item record;
  v_warehouse_id uuid;
  v_total numeric(14, 2) := 0;
  v_vat_rate numeric(5, 2);
  v_vat numeric(14, 2);
  v_account_411 uuid;
  v_account_701 uuid;
  v_account_4431 uuid;
  v_entry_id uuid;
begin
  if v_role is null or v_role not in ('admin', 'manager') then
    raise exception 'Rôle % non autorisé à annuler une commande', coalesce(v_role, '(aucun)');
  end if;

  select * into v_order from public.orders o where o.id = cancel_order.order_id;

  if v_order is null then
    raise exception 'Commande introuvable';
  end if;

  if v_role <> 'admin' and v_order.company_id is distinct from v_caller_company then
    raise exception 'Impossible d''annuler une commande d''une autre société';
  end if;

  if v_order.status <> 'pending' then
    raise exception 'Seule une commande en attente peut être annulée (statut actuel : %)', v_order.status;
  end if;

  select t.warehouse_id into v_warehouse_id
  from public.transactions t
  where t.order_id = v_order.id
  limit 1;

  for v_item in select * from public.order_items where order_items.order_id = v_order.id
  loop
    insert into public.transactions (product_id, type, quantity, user_id, warehouse_id, order_id)
    values (v_item.product_id, 'ADJUSTMENT', v_item.quantity, auth.uid(), v_warehouse_id, v_order.id);

    v_total := v_total + (v_item.quantity * v_item.unit_price);
  end loop;

  update public.orders set status = 'cancelled' where id = v_order.id
  returning * into v_order;

  if v_total > 0 then
    select vat_rate into v_vat_rate from public.companies where id = v_order.company_id;
    v_vat := round(v_total * v_vat_rate / 100, 2);

    select id into v_account_411 from public.chart_of_accounts where company_id = v_order.company_id and code = '411';
    select id into v_account_701 from public.chart_of_accounts where company_id = v_order.company_id and code = '701';
    select id into v_account_4431 from public.chart_of_accounts where company_id = v_order.company_id and code = '4431';

    if v_account_411 is null or v_account_701 is null or v_account_4431 is null then
      raise exception 'Plan comptable incomplet pour cette société (comptes 411/701/4431 requis)';
    end if;

    insert into public.journal_entries (company_id, journal_code, description, order_id)
    values (v_order.company_id, 'VENTES', 'Annulation vente #' || left(v_order.id::text, 8), v_order.id)
    returning id into v_entry_id;

    -- Contre-passation exacte de l'écriture de vente d'origine (sens inversé, 3 lignes).
    insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
    values (v_entry_id, v_account_701, v_total, 0);

    insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
    values (v_entry_id, v_account_4431, v_vat, 0);

    insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
    values (v_entry_id, v_account_411, 0, v_total + v_vat);
  end if;

  return v_order;
end;
$$;
