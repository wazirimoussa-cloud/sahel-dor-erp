-- Remplace le menu déroulant "Transporteur (si perte)" par une saisie libre avec
-- auto-création : deux frictions réelles rencontrées en vérification live le même jour --
-- Formation s'est retrouvée avec zéro transporteur (liste vide, saisie de perte impossible),
-- et aucun des 5 comptes de test n'avait transporteurs.gerer en opérationnel pour en créer un
-- via l'écran dédié. receive_purchase() résout désormais un NOM de transporteur (au lieu d'un
-- id) : réutilise l'existant si la casse/les espaces superflus près, sinon en crée un nouveau
-- à la volée. Reste de la fonction inchangé (copie verbatim de 0076_retrait_frais_achat.sql).
--
-- Autorisation assumée : la création implicite d'un transporteur via cette RPC ne dépend que
-- de achats.receptionner (déjà requis pour toute réception), pas de transporteurs.gerer --
-- c'est précisément l'objectif de la demande.

create or replace function public.receive_purchase(
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
  v_entry_id uuid;
  v_transporter_name text;
  v_transporter_id uuid;
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

    select * into v_product from public.products where id = v_item.product_id;

    if v_quantity_received > 0 then
      insert into public.transactions (product_id, type, quantity, user_id, warehouse_id, purchase_id, expiry_date, unit_cost)
      values (v_item.product_id, 'IN', v_quantity_received, auth.uid(), v_purchase.warehouse_id, v_purchase.id, v_expiry_date, v_product.unit_cost);
    end if;

    if v_quantity_lost > 0 then
      v_transporter_name := nullif(trim(v_loss ->> 'transporter_name'), '');

      if v_transporter_name is null then
        raise exception 'Un transporteur est requis pour déclarer une perte';
      end if;

      -- Réutilise un transporteur existant pour cette société (insensible à la casse et aux
      -- espaces superflus), sinon en crée un nouveau à la volée -- évite les doublons créés
      -- par de simples variations de frappe.
      select id into v_transporter_id
      from public.transporters
      where company_id = v_caller_company
        and lower(trim(name)) = lower(v_transporter_name)
      limit 1;

      if v_transporter_id is null then
        insert into public.transporters (company_id, name)
        values (v_caller_company, v_transporter_name)
        returning id into v_transporter_id;
      end if;

      insert into public.purchase_losses (purchase_id, transporter_id, product_id, quantity_lost, unit_cost, reason, user_id)
      values (
        v_purchase.id,
        v_transporter_id,
        v_item.product_id,
        v_quantity_lost,
        v_item.unit_cost,
        v_loss ->> 'reason',
        auth.uid()
      );
    end if;

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

  return v_purchase;
end;
$$;
