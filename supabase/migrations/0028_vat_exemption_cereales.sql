-- Exoneration de TVA pour les cereales et le sel (Art. 322 nouveau, point 2 de
-- l'Ordonnance N-2025-44) : jusqu'ici la TVA (19%) etait appliquee uniformement sur
-- TOUTE vente/achat, sans distinction de produit. Or le texte exonere explicitement les
-- cereales (mais, mil, sorgho, fonio, ble, riz hors riz de luxe) et le sel de TVA, que
-- l'operation soit un achat ou une vente. Le Sucre et l'Huile ne sont PAS sur la liste
-- d'exoneration et restent taxables a 19%.
--
-- Decision assumee pour le Niebe et l'Arachide decortiquee (legumineuses, pas des
-- cereales au sens strict du texte) : NON exonerees, faute de base legale explicite les
-- couvrant dans ce document -- a confirmer si une autre disposition les couvre.

alter table public.products
  add column vat_exempt boolean not null default false;

update public.products
set vat_exempt = true
where name in ('Riz local', 'Sorgho', 'Mil', 'Riz local (formation)', 'Sorgho (formation)', 'Mil (formation)');

-- Reecriture : la TVA se calcule desormais uniquement sur la somme des lignes dont le
-- produit n'est pas exonere (v_taxable_total), le total HT/TTC global (601/701/401/411)
-- reste inchange -- seule la repartition HT/TVA change pour les lignes exonerees.

create or replace function public.validate_order(order_id uuid)
returns orders
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_role text := public.current_role_name();
  v_caller_company uuid := public.current_company_id();
  v_order public.orders;
  v_item record;
  v_product public.products;
  v_total numeric(14, 2) := 0;
  v_taxable_total numeric(14, 2) := 0;
  v_vat_rate numeric(5, 2);
  v_vat numeric(14, 2);
  v_account_411 uuid;
  v_account_701 uuid;
  v_account_4431 uuid;
  v_entry_id uuid;
begin
  if v_role is null or v_role <> 'supervisor' then
    raise exception 'Rôle % non autorisé à valider une commande', coalesce(v_role, '(aucun)');
  end if;

  select * into v_order from public.orders o where o.id = validate_order.order_id;

  if v_order is null then
    raise exception 'Commande introuvable';
  end if;

  if v_order.company_id is distinct from v_caller_company then
    raise exception 'Impossible de valider une commande d''une autre société';
  end if;

  if v_order.status <> 'pending' then
    raise exception 'Seule une commande en attente peut être validée (statut actuel : %)', v_order.status;
  end if;

  for v_item in select * from public.order_items where order_items.order_id = v_order.id
  loop
    insert into public.transactions (product_id, type, quantity, user_id, warehouse_id, order_id)
    values (v_item.product_id, 'OUT', v_item.quantity, auth.uid(), v_order.warehouse_id, v_order.id);

    select * into v_product from public.products where id = v_item.product_id;

    v_total := v_total + (v_item.quantity * v_item.unit_price);
    if v_product.vat_exempt is not true then
      v_taxable_total := v_taxable_total + (v_item.quantity * v_item.unit_price);
    end if;
  end loop;

  update public.orders set status = 'validated' where id = v_order.id
  returning * into v_order;

  if v_total > 0 then
    select vat_rate into v_vat_rate from public.companies where id = v_order.company_id;
    v_vat := round(v_taxable_total * v_vat_rate / 100, 2);

    select id into v_account_411 from public.chart_of_accounts where company_id = v_order.company_id and code = '411';
    select id into v_account_701 from public.chart_of_accounts where company_id = v_order.company_id and code = '701';
    select id into v_account_4431 from public.chart_of_accounts where company_id = v_order.company_id and code = '4431';

    if v_account_411 is null or v_account_701 is null or v_account_4431 is null then
      raise exception 'Plan comptable incomplet pour cette société (comptes 411/701/4431 requis)';
    end if;

    insert into public.journal_entries (company_id, journal_code, description, order_id)
    values (v_order.company_id, 'VENTES', 'Vente #' || left(v_order.id::text, 8), v_order.id)
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

create or replace function public.receive_purchase(purchase_id uuid, losses jsonb default '[]'::jsonb)
returns purchases
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_role text := public.current_role_name();
  v_caller_company uuid := public.current_company_id();
  v_purchase public.purchases;
  v_item record;
  v_product public.products;
  v_loss jsonb;
  v_quantity_lost numeric(12, 3);
  v_quantity_received numeric(12, 3);
  v_total numeric(14, 2) := 0;
  v_taxable_total numeric(14, 2) := 0;
  v_vat_rate numeric(5, 2);
  v_vat numeric(14, 2);
  v_account_601 uuid;
  v_account_401 uuid;
  v_account_4452 uuid;
  v_entry_id uuid;
begin
  if v_role is null or v_role <> 'warehouse_manager' then
    raise exception 'Rôle % non autorisé à réceptionner un achat', coalesce(v_role, '(aucun)');
  end if;

  select * into v_purchase from public.purchases p where p.id = receive_purchase.purchase_id;

  if v_purchase is null then
    raise exception 'Achat introuvable';
  end if;

  if v_purchase.company_id is distinct from v_caller_company then
    raise exception 'Impossible de réceptionner un achat d''une autre société';
  end if;

  if v_purchase.status <> 'pending' then
    raise exception 'Seul un achat en attente peut être réceptionné (statut actuel : %)', v_purchase.status;
  end if;

  for v_item in select * from public.purchase_items where purchase_items.purchase_id = v_purchase.id
  loop
    v_loss := (
      select l from jsonb_array_elements(coalesce(receive_purchase.losses, '[]')) l
      where (l ->> 'product_id')::uuid = v_item.product_id
      limit 1
    );

    v_quantity_lost := coalesce((v_loss ->> 'quantity_lost')::numeric, 0);
    v_quantity_received := v_item.quantity - v_quantity_lost;

    if v_quantity_received < 0 then
      raise exception 'La perte déclarée dépasse la quantité commandée pour un produit';
    end if;

    if v_quantity_received > 0 then
      insert into public.transactions (product_id, type, quantity, user_id, warehouse_id, purchase_id)
      values (v_item.product_id, 'IN', v_quantity_received, auth.uid(), v_purchase.warehouse_id, v_purchase.id);
    end if;

    if v_quantity_lost > 0 then
      if (v_loss ->> 'transporter_id') is null then
        raise exception 'Un transporteur est requis pour déclarer une perte';
      end if;

      insert into public.purchase_losses (purchase_id, transporter_id, product_id, quantity_lost, unit_cost, reason, user_id)
      values (
        v_purchase.id,
        (v_loss ->> 'transporter_id')::uuid,
        v_item.product_id,
        v_quantity_lost,
        v_item.unit_cost,
        v_loss ->> 'reason',
        auth.uid()
      );
    end if;

    select * into v_product from public.products where id = v_item.product_id;

    v_total := v_total + (v_item.quantity * v_item.unit_cost);
    if v_product.vat_exempt is not true then
      v_taxable_total := v_taxable_total + (v_item.quantity * v_item.unit_cost);
    end if;
  end loop;

  update public.purchases set status = 'received' where id = v_purchase.id
  returning * into v_purchase;

  if v_total > 0 then
    select vat_rate into v_vat_rate from public.companies where id = v_purchase.company_id;
    v_vat := round(v_taxable_total * v_vat_rate / 100, 2);

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
