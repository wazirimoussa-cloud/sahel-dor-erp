-- Ajoute le taux de TVA réduit sur le sucre et l'huile alimentaire (Art. 226 CGI, Ordonnance
-- 2025-22, en vigueur depuis le 1er janvier 2026) : "Le taux normal de la TVA est de 19%.
-- Toutefois, les opérations d'importation ou de vente à l'intérieur de sucre et d'huile
-- alimentaire sont soumises à un taux réduit de 5%." Jusqu'ici products.vat_exempt ne
-- distinguait que exonéré (0%) / taxable au taux plein — pas de troisième état pour ce taux
-- réduit. Sucre et huile sont pourtant des produits centraux de l'activité (voir les
-- nombreux "Sucre BUA"/"Huile ..." créés en test) : un vrai écart de calcul, pas seulement
-- documentaire, contrairement aux corrections de comptes des migrations précédentes.
--
-- Décision confirmée avec l'utilisateur : implémenté. Même patron que vat_exempt (booléen
-- par produit, fixé à la création uniquement) + un taux configurable par société
-- (vat_reduced_rate, tracé dans fiscal_rate_history comme les 17 autres taux de 0087) plutôt
-- que 5% codé en dur -- cohérent avec le reste de l'écran Paramètres fiscaux.

alter table public.companies
  add column vat_reduced_rate numeric(5, 2) not null default 5;

alter table public.products
  add column vat_reduced boolean not null default false;

-- Un produit ne peut pas être à la fois exonéré et à taux réduit (données ambiguës sinon,
-- même logique que la cohérence dégressif/coefficient sur fixed_assets, 0069).
alter table public.products
  add constraint products_vat_exempt_reduced_exclusive check (not (vat_exempt and vat_reduced));

-- Backfill : tout produit "sucre"/"huile" existant, corrigé au bon état -- y compris "Sucre
-- BUA" qui avait été marqué (à tort) exonéré lors d'un test, plutôt qu'à taux réduit.
update public.products
set vat_exempt = false, vat_reduced = true
where (name ilike '%sucre%' or name ilike '%huile%');

-- validate_order : copie verbatim de 0032_attributions.sql, calcul TVA étendu à 3 paliers
-- (exonéré/réduit/normal) au lieu de 2 (exonéré/normal).
create or replace function public.validate_order(order_id uuid)
returns orders
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_caller_company uuid := public.current_company_id();
  v_order public.orders;
  v_item record;
  v_product public.products;
  v_total numeric(14, 2) := 0;
  v_taxable_total numeric(14, 2) := 0;
  v_taxable_total_reduced numeric(14, 2) := 0;
  v_vat_rate numeric(5, 2);
  v_vat_reduced_rate numeric(5, 2);
  v_vat numeric(14, 2);
  v_account_411 uuid;
  v_account_701 uuid;
  v_account_4431 uuid;
  v_entry_id uuid;
begin
  if not public.has_attribution('ventes.valider_commande') then
    raise exception 'Non autorisé à valider une commande';
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
    if v_product.vat_exempt is true then
      null;
    elsif v_product.vat_reduced is true then
      v_taxable_total_reduced := v_taxable_total_reduced + (v_item.quantity * v_item.unit_price);
    else
      v_taxable_total := v_taxable_total + (v_item.quantity * v_item.unit_price);
    end if;
  end loop;

  update public.orders set status = 'validated' where id = v_order.id
  returning * into v_order;

  if v_total > 0 then
    select vat_rate, vat_reduced_rate into v_vat_rate, v_vat_reduced_rate
    from public.companies where id = v_order.company_id;
    v_vat := round(v_taxable_total * v_vat_rate / 100, 2) + round(v_taxable_total_reduced * v_vat_reduced_rate / 100, 2);

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

-- receive_purchase : copie verbatim de 0089_recouvrement_pertes_transport.sql, calcul TVA
-- étendu à 3 paliers (exonéré/réduit/normal). La répartition 601/4098 (perte transport) et
-- le reste de la logique restent inchangés.
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
  v_total_lost numeric(14, 2) := 0;
  v_taxable_total numeric(14, 2) := 0;
  v_taxable_total_reduced numeric(14, 2) := 0;
  v_vat_rate numeric(5, 2);
  v_vat_reduced_rate numeric(5, 2);
  v_vat numeric(14, 2);
  v_account_601 uuid;
  v_account_401 uuid;
  v_account_4452 uuid;
  v_account_4098 uuid;
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

      v_total_lost := v_total_lost + (v_quantity_lost * v_item.unit_cost);
    end if;

    v_total := v_total + (v_item.quantity * v_item.unit_cost);
    if v_product.vat_exempt is true then
      null;
    elsif v_product.vat_reduced is true then
      v_taxable_total_reduced := v_taxable_total_reduced + (v_item.quantity * v_item.unit_cost);
    else
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
    select vat_rate, vat_reduced_rate into v_vat_rate, v_vat_reduced_rate
    from public.companies where id = v_purchase.company_id;
    v_vat := round(v_taxable_total * v_vat_rate / 100, 2) + round(v_taxable_total_reduced * v_vat_reduced_rate / 100, 2);

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
    values (v_entry_id, v_account_601, v_total - v_total_lost, 0);

    if v_total_lost > 0 then
      select id into v_account_4098 from public.chart_of_accounts where company_id = v_purchase.company_id and code = '4098';

      if v_account_4098 is null then
        raise exception 'Plan comptable incomplet pour cette société (compte 4098 requis)';
      end if;

      insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
      values (v_entry_id, v_account_4098, v_total_lost, 0);
    end if;

    insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
    values (v_entry_id, v_account_4452, v_vat, 0);

    insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
    values (v_entry_id, v_account_401, 0, v_total + v_vat);
  end if;

  return v_purchase;
end;
$$;

-- update_fiscal_rates : ajoute p_vat_reduced_rate (19ᵉ paramètre) -- signature étendue,
-- drop de l'ancienne (0087) requise avant de recréer avec le nouveau paramètre.
drop function if exists public.update_fiscal_rates(
  uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric
);

create or replace function public.update_fiscal_rates(
  p_company_id uuid,
  p_vat_rate numeric,
  p_vat_reduced_rate numeric,
  p_impot_societes_rate numeric,
  p_precompte_isb_rate numeric,
  p_taxe_immobiliere_rate numeric,
  p_taxe_professionnelle_droit_fixe_pour_mille numeric,
  p_taxe_professionnelle_plancher numeric,
  p_taxe_professionnelle_droit_proportionnel_rate numeric,
  p_taxe_professionnelle_ca_annuel numeric,
  p_taxe_professionnelle_valeur_locative numeric,
  p_irvm_dividendes_rate numeric,
  p_irvm_plus_values_cession_rate numeric,
  p_irvm_obligations_rate numeric,
  p_droits_enregistrement_actes_societe numeric,
  p_droits_enregistrement_fonds_commerce_rate numeric,
  p_taxe_publicite_panneau_papier_rate numeric,
  p_taxe_publicite_panneau_autre_rate numeric,
  p_redevance_domaine_public_rate numeric
)
returns public.companies
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_caller_company uuid := public.current_company_id();
  v_company public.companies;
  v_user_id uuid := auth.uid();
begin
  if not public.has_attribution('comptabilite.modifier_capital_social') then
    raise exception 'Non autorisé à modifier les taux fiscaux';
  end if;

  select * into v_company from public.companies c where c.id = p_company_id;

  if v_company is null or v_company.id <> v_caller_company then
    raise exception 'Société introuvable';
  end if;

  insert into public.fiscal_rate_history (company_id, field_name, old_value, new_value, user_id)
  select v_company.id, t.field_name, t.old_value, t.new_value, v_user_id
  from (values
    ('vat_rate', v_company.vat_rate, p_vat_rate),
    ('vat_reduced_rate', v_company.vat_reduced_rate, p_vat_reduced_rate),
    ('impot_societes_rate', v_company.impot_societes_rate, p_impot_societes_rate),
    ('precompte_isb_rate', v_company.precompte_isb_rate, p_precompte_isb_rate),
    ('taxe_immobiliere_rate', v_company.taxe_immobiliere_rate, p_taxe_immobiliere_rate),
    ('taxe_professionnelle_droit_fixe_pour_mille', v_company.taxe_professionnelle_droit_fixe_pour_mille, p_taxe_professionnelle_droit_fixe_pour_mille),
    ('taxe_professionnelle_plancher', v_company.taxe_professionnelle_plancher, p_taxe_professionnelle_plancher),
    ('taxe_professionnelle_droit_proportionnel_rate', v_company.taxe_professionnelle_droit_proportionnel_rate, p_taxe_professionnelle_droit_proportionnel_rate),
    ('taxe_professionnelle_ca_annuel', v_company.taxe_professionnelle_ca_annuel, p_taxe_professionnelle_ca_annuel),
    ('taxe_professionnelle_valeur_locative', v_company.taxe_professionnelle_valeur_locative, p_taxe_professionnelle_valeur_locative),
    ('irvm_dividendes_rate', v_company.irvm_dividendes_rate, p_irvm_dividendes_rate),
    ('irvm_plus_values_cession_rate', v_company.irvm_plus_values_cession_rate, p_irvm_plus_values_cession_rate),
    ('irvm_obligations_rate', v_company.irvm_obligations_rate, p_irvm_obligations_rate),
    ('droits_enregistrement_actes_societe', v_company.droits_enregistrement_actes_societe, p_droits_enregistrement_actes_societe),
    ('droits_enregistrement_fonds_commerce_rate', v_company.droits_enregistrement_fonds_commerce_rate, p_droits_enregistrement_fonds_commerce_rate),
    ('taxe_publicite_panneau_papier_rate', v_company.taxe_publicite_panneau_papier_rate, p_taxe_publicite_panneau_papier_rate),
    ('taxe_publicite_panneau_autre_rate', v_company.taxe_publicite_panneau_autre_rate, p_taxe_publicite_panneau_autre_rate),
    ('redevance_domaine_public_rate', v_company.redevance_domaine_public_rate, p_redevance_domaine_public_rate)
  ) as t(field_name, old_value, new_value)
  where t.old_value <> t.new_value;

  update public.companies set
    vat_rate = p_vat_rate,
    vat_reduced_rate = p_vat_reduced_rate,
    impot_societes_rate = p_impot_societes_rate,
    precompte_isb_rate = p_precompte_isb_rate,
    taxe_immobiliere_rate = p_taxe_immobiliere_rate,
    taxe_professionnelle_droit_fixe_pour_mille = p_taxe_professionnelle_droit_fixe_pour_mille,
    taxe_professionnelle_plancher = p_taxe_professionnelle_plancher,
    taxe_professionnelle_droit_proportionnel_rate = p_taxe_professionnelle_droit_proportionnel_rate,
    taxe_professionnelle_ca_annuel = p_taxe_professionnelle_ca_annuel,
    taxe_professionnelle_valeur_locative = p_taxe_professionnelle_valeur_locative,
    irvm_dividendes_rate = p_irvm_dividendes_rate,
    irvm_plus_values_cession_rate = p_irvm_plus_values_cession_rate,
    irvm_obligations_rate = p_irvm_obligations_rate,
    droits_enregistrement_actes_societe = p_droits_enregistrement_actes_societe,
    droits_enregistrement_fonds_commerce_rate = p_droits_enregistrement_fonds_commerce_rate,
    taxe_publicite_panneau_papier_rate = p_taxe_publicite_panneau_papier_rate,
    taxe_publicite_panneau_autre_rate = p_taxe_publicite_panneau_autre_rate,
    redevance_domaine_public_rate = p_redevance_domaine_public_rate
  where id = p_company_id
  returning * into v_company;

  return v_company;
end;
$$;

grant execute on function public.update_fiscal_rates(
  uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric
) to authenticated;
