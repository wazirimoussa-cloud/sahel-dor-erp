-- Déplace la saisie des frais de transport/manutention de la réception (Magasinier)
-- vers la création de l'achat (Gérant) : le Gérant connaît déjà le prix négocié avec
-- le fournisseur, et négocie généralement le transport au même moment. Le Magasinier
-- ne peut de toute façon jamais détenir achats.receptionner ET achats.creer à la fois
-- (séparation des tâches imposée par trigger), donc les frais doivent être saisis à
-- une étape que le Gérant contrôle réellement -- la création, pas la réception.
--
-- Le calcul du prix de revient lui-même est inchangé : toujours achat + quote-part des
-- frais au prorata de la quantité COMMANDÉE (pas reçue), toujours capitalisé sur les
-- lots via stock_lots.unit_cost à la réception. Seule la SOURCE des deux montants change
-- (purchases.freight_cost/handling_cost, désormais fixés dès la création) -- receive_purchase
-- ne fait plus que les lire, il ne les reçoit plus en paramètre.

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

  insert into public.purchases (company_id, supplier_id, warehouse_id, user_id, status, freight_cost, handling_cost)
  values (
    v_caller_company, v_supplier_id, v_warehouse_id, auth.uid(), 'pending',
    coalesce((payload ->> 'freight_cost')::numeric, 0),
    coalesce((payload ->> 'handling_cost')::numeric, 0)
  )
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
      coalesce((v_item ->> 'unit_cost')::numeric, v_product.price)
    );
  end loop;

  return v_purchase;
end;
$$;

drop function if exists public.receive_purchase(uuid, jsonb, jsonb, text, text, text, integer, text, numeric, numeric);

create function public.receive_purchase(
  purchase_id uuid,
  losses jsonb default '[]'::jsonb,
  lot_expiry_dates jsonb default '[]'::jsonb,
  p_driver_name text default null,
  p_truck_plate text default null,
  p_driver_phone text default null,
  p_repackage_count integer default null,
  p_observation text default null
)
returns purchases
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_caller_company uuid := public.current_company_id();
  v_purchase public.purchases;
  v_item record;
  v_product public.products;
  v_loss jsonb;
  v_quantity_lost numeric(12, 3);
  v_quantity_received numeric(12, 3);
  v_expiry_date date;
  v_total numeric(14, 2) := 0;
  v_taxable_total numeric(14, 2) := 0;
  v_vat_rate numeric(5, 2);
  v_vat numeric(14, 2);
  v_account_601 uuid;
  v_account_401 uuid;
  v_account_4452 uuid;
  v_account_608 uuid;
  v_account_521 uuid;
  v_entry_id uuid;
  v_total_ordered_qty numeric(14, 3) := 0;
  v_ancillary_per_unit numeric(14, 4);
  v_landed_unit_cost numeric(14, 4);
  v_ancillary_total numeric(12, 2);
begin
  if not public.has_attribution('achats.receptionner') then
    raise exception 'Non autorisé à réceptionner un achat';
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

  select coalesce(sum(quantity), 0) into v_total_ordered_qty
  from public.purchase_items where purchase_items.purchase_id = v_purchase.id;

  -- Frais de transport/manutention fixés par le Gérant à la création de l'achat
  -- (colonnes purchases.freight_cost/handling_cost) -- la réception ne fait que les lire.
  v_ancillary_per_unit := case
    when v_total_ordered_qty > 0 then (coalesce(v_purchase.freight_cost, 0) + coalesce(v_purchase.handling_cost, 0)) / v_total_ordered_qty
    else 0
  end;

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

    v_expiry_date := (
      select (e ->> 'expiry_date')::date
      from jsonb_array_elements(coalesce(receive_purchase.lot_expiry_dates, '[]')) e
      where (e ->> 'product_id')::uuid = v_item.product_id
      limit 1
    );

    v_landed_unit_cost := v_item.unit_cost + v_ancillary_per_unit;

    if v_quantity_received > 0 then
      insert into public.transactions (product_id, type, quantity, user_id, warehouse_id, purchase_id, expiry_date, unit_cost)
      values (v_item.product_id, 'IN', v_quantity_received, auth.uid(), v_purchase.warehouse_id, v_purchase.id, v_expiry_date, v_landed_unit_cost);
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

  update public.purchases
  set status = 'received',
      received_at = now(),
      driver_name = p_driver_name,
      truck_plate = p_truck_plate,
      driver_phone = p_driver_phone,
      repackage_count = p_repackage_count,
      observation = p_observation
  where id = v_purchase.id
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

  v_ancillary_total := coalesce(v_purchase.freight_cost, 0) + coalesce(v_purchase.handling_cost, 0);
  if v_ancillary_total > 0 then
    select id into v_account_608 from public.chart_of_accounts where company_id = v_purchase.company_id and code = '608';
    select id into v_account_521 from public.chart_of_accounts where company_id = v_purchase.company_id and code = '521';

    if v_account_608 is null or v_account_521 is null then
      raise exception 'Plan comptable incomplet pour cette société (comptes 608/521 requis)';
    end if;

    insert into public.journal_entries (company_id, journal_code, description, purchase_id)
    values (v_purchase.company_id, 'FRAIS', 'Frais accessoires réception #' || left(v_purchase.id::text, 8), v_purchase.id)
    returning id into v_entry_id;

    insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
    values (v_entry_id, v_account_608, v_ancillary_total, 0);

    insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
    values (v_entry_id, v_account_521, 0, v_ancillary_total);
  end if;

  return v_purchase;
end;
$$;
