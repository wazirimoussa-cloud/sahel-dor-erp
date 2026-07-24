-- Prix de revient par unité : intègre au coût du stock, en plus du prix d'achat, les
-- frais de transport et de manutention d'une réception, répartis au prorata de la
-- quantité commandée (décision utilisateur) ; corrige au passage le coût du
-- reconditionnement (circuit pertes de stock), qui reprenait par erreur le prix de
-- VENTE du produit au lieu du coût réel du lot consommé.
--
-- Décisions confirmées avec l'utilisateur :
-- - Répartition des frais globaux d'une réception : au prorata de la QUANTITÉ commandée
--   par ligne (pas de la valeur) -- limite assumée si une même réception mélange des
--   produits d'unités très différentes (tonnes/cartons/bidons), documentée au README.
-- - Une perte constatée en transit ne gonfle PAS le prix de revient des marchandises
--   survivantes : la répartition se fait sur la quantité COMMANDÉE (dénominateur fixe),
--   pas sur la quantité reçue -- la part de frais correspondant à la quantité perdue
--   n'est capitalisée nulle part, cohérent avec le fait que la perte reste une
--   réclamation séparée contre le transporteur (déjà en place).
-- - Frais inscrits en paiement comptant immédiat (Débit 608 / Crédit 521), même
--   simplification déjà assumée pour l'acquisition d'une immobilisation (Phase 18) --
--   pas de dette fournisseur/transporteur distincte suivie par ailleurs.
-- - Aucune TVA modélisée sur ces frais (limite assumée, comme le reste des
--   simplifications déjà documentées dans ce module).

alter table public.purchases add column freight_cost numeric(12, 2) not null default 0 check (freight_cost >= 0);
alter table public.purchases add column handling_cost numeric(12, 2) not null default 0 check (handling_cost >= 0);

-- Compte 608 (Frais accessoires d'achat) pour chaque société existante -- seul compte
-- réellement posté par cette écriture, même logique que les comptes déjà bootstrappés.
insert into public.chart_of_accounts (company_id, code, name)
select id, '608', 'Frais accessoires d''achat (transport, manutention)' from public.companies
on conflict (company_id, code) do nothing;

drop function if exists public.receive_purchase(uuid, jsonb, jsonb, text, text, text, integer, text);

create function public.receive_purchase(
  purchase_id uuid,
  losses jsonb default '[]'::jsonb,
  lot_expiry_dates jsonb default '[]'::jsonb,
  p_driver_name text default null,
  p_truck_plate text default null,
  p_driver_phone text default null,
  p_repackage_count integer default null,
  p_observation text default null,
  p_freight_cost numeric default 0,
  p_handling_cost numeric default 0
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

  v_ancillary_per_unit := case
    when v_total_ordered_qty > 0 then (coalesce(p_freight_cost, 0) + coalesce(p_handling_cost, 0)) / v_total_ordered_qty
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

    -- Prix de revient unitaire = prix d'achat + part des frais de transport/manutention
    -- (répartis sur la quantité COMMANDÉE, pas reçue -- la perte n'alourdit pas la part
    -- des survivants).
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
      observation = p_observation,
      freight_cost = coalesce(p_freight_cost, 0),
      handling_cost = coalesce(p_handling_cost, 0)
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

  v_ancillary_total := coalesce(p_freight_cost, 0) + coalesce(p_handling_cost, 0);
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

-- Corrige le coût du reconditionnement (circuit pertes de stock) : l'extrant héritait à
-- tort du prix de VENTE courant du produit (products.price) au lieu du coût réel des
-- lots consommés -- incohérent avec un vrai "prix de revient". Reprend la même logique
-- de coût moyen pondéré déjà utilisée pour transfer_stock.
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
  v_repack_unit_cost numeric(12, 2);
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
    insert into public.transactions (product_id, type, quantity, user_id, warehouse_id, note)
    values (v_request.product_id, 'ADJUSTMENT', -v_request.quantity, v_request.requested_by, v_request.warehouse_id, v_request.reason)
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

    insert into public.transactions (product_id, type, quantity, user_id, warehouse_id, transformation_id)
    values (v_request.product_id, 'OUT', v_request.quantity, v_request.requested_by, v_request.warehouse_id, v_transformation.id)
    returning id into v_out_transaction_id;

    select
      min(sl.expiry_date) filter (where sl.expiry_date is not null),
      case when sum(tla.quantity) > 0 then sum(tla.quantity * sl.unit_cost) / sum(tla.quantity) else null end
    into v_expiry_date, v_repack_unit_cost
    from public.transaction_lot_allocations tla
    join public.stock_lots sl on sl.id = tla.lot_id
    where tla.transaction_id = v_out_transaction_id;

    insert into public.transformation_outputs (transformation_id, product_id, quantity, unit_cost)
    values (v_transformation.id, v_request.product_id, v_request.repackaged_quantity, coalesce(v_repack_unit_cost, 0));

    insert into public.transactions (product_id, type, quantity, user_id, warehouse_id, transformation_id, expiry_date)
    values (v_request.product_id, 'IN', v_request.repackaged_quantity, v_request.requested_by, v_request.warehouse_id, v_transformation.id, v_expiry_date);

    update public.stock_loss_requests
    set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), transformation_id = v_transformation.id
    where id = p_request_id
    returning * into v_request;
  end if;

  return v_request;
end;
$$;
