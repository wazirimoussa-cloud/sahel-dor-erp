-- Corrige le compte 601 sur les pertes transport + ajoute le suivi du recouvrement des
-- avoirs transporteur.
--
-- Revient sur un choix documenté dans 0020_transporters_purchase_losses.sql : "L'écriture
-- comptable ACHATS reste calculée sur la quantité commandée complète : Sahel d'Or doit
-- toujours au fournisseur le montant facturé, la perte est une réclamation séparée contre
-- le transporteur, pas une réduction de cette dette." Cette moitié du raisonnement reste
-- vraie (la dette envers le FOURNISSEUR, compte 401, ne doit pas bouger) — mais elle avait
-- été appliquée aussi au compte 601 (achats), qui se retrouvait débité de la valeur de
-- marchandises jamais entrées en stock, sans aucune contrepartie enregistrant la créance
-- envers le transporteur responsable. La "facture d'avoir" générée par l'app n'était donc
-- qu'un document PDF, invisible du grand livre — ni à l'émission, ni à son recouvrement.
--
-- Nouveau traitement :
--   - 601 (achats) débité uniquement de la valeur réellement reçue en stock.
--   - 4098 "Avoirs à recevoir" (nouveau compte, famille SYSCOHADA 409 — fournisseurs
--     débiteurs) débité de la valeur perdue : la créance envers le transporteur.
--   - 401 (fournisseurs) et 4452 (TVA déductible) inchangés : la dette envers le
--     FOURNISSEUR et la TVA récupérable portent sur la facture reçue, indépendantes de la
--     faute du transporteur — 601 + 4098 = montant qui était déjà débité globalement avant
--     cette migration, l'écriture reste équilibrée.
--   - purchase_loss_recoveries (nouvelle table, même patron que order_payments/0019 :
--     append-only, un recouvrement partiel possible) + record_purchase_loss_recovery
--     (RPC) : quand le transporteur rembourse, débite 521 (trésorerie)/crédite 4098 —
--     symétrique à record_payment pour les encaissements clients.

insert into public.chart_of_accounts (company_id, code, name)
select id, '4098', 'Avoirs à recevoir (transporteurs, fournisseurs)' from public.companies
on conflict (company_id, code) do nothing;

alter table public.purchase_losses
  add column recovered_amount numeric(12, 2) not null default 0;

create table public.purchase_loss_recoveries (
  id uuid primary key default gen_random_uuid(),
  purchase_loss_id uuid not null references public.purchase_losses (id),
  amount numeric(12, 2) not null check (amount > 0),
  user_id uuid not null references public.users (id),
  created_at timestamptz not null default now()
);

create index purchase_loss_recoveries_loss_id_idx on public.purchase_loss_recoveries (purchase_loss_id);

alter table public.purchase_loss_recoveries enable row level security;

-- Lecture large scopée société (même philosophie que purchase_losses_select), écriture
-- exclusivement via record_purchase_loss_recovery (SECURITY DEFINER) — aucune policy
-- insert/update. Append-only, comme order_payments/transactions/logs.
create policy purchase_loss_recoveries_select on public.purchase_loss_recoveries
  for select to authenticated
  using (
    exists (
      select 1
      from public.purchase_losses pl
      join public.purchases p on p.id = pl.purchase_id
      where pl.id = purchase_loss_recoveries.purchase_loss_id
        and (public.current_role_name() = 'admin' or p.company_id = public.current_company_id())
    )
  );

create trigger trg_purchase_loss_recoveries_immutable
  before update or delete on public.purchase_loss_recoveries
  for each row execute function public.fn_block_mutation();

-- receive_purchase : copie verbatim de 0086_transporteur_perte_saisie_libre.sql, seule la
-- section écriture comptable change (répartition 601/4098 au lieu de 601 seul).
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
  v_vat_rate numeric(5, 2);
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

      v_total_lost := v_total_lost + (v_quantity_lost * v_item.unit_cost);
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

-- Enregistre un recouvrement (partiel ou total) auprès du transporteur responsable d'une
-- perte. Même autorisation que la gestion des transporteurs (transporteurs.gerer) : c'est
-- une créance envers un transporteur, pas une opération de réception d'achat. Même
-- structure que record_payment (0019) côté encaissements clients : chaque recouvrement
-- devient une ligne append-only, le cumul recovered_amount est recalculé depuis la somme
-- de ces lignes, jamais fourni directement par l'appelant.
create or replace function public.record_purchase_loss_recovery(p_loss_id uuid, p_amount numeric)
returns public.purchase_losses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_company uuid := public.current_company_id();
  v_loss public.purchase_losses;
  v_purchase_company uuid;
  v_total numeric(14, 2);
  v_new_recovered numeric(14, 2);
  v_account_521 uuid;
  v_account_4098 uuid;
  v_entry_id uuid;
begin
  if not public.has_attribution('transporteurs.gerer') then
    raise exception 'Non autorisé à enregistrer un recouvrement';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Le montant recouvré doit être positif';
  end if;

  select * into v_loss from public.purchase_losses pl where pl.id = p_loss_id;

  if v_loss is null then
    raise exception 'Perte introuvable';
  end if;

  select p.company_id into v_purchase_company from public.purchases p where p.id = v_loss.purchase_id;

  if v_purchase_company is distinct from v_caller_company then
    raise exception 'Impossible d''enregistrer un recouvrement pour une perte d''une autre société';
  end if;

  v_total := v_loss.quantity_lost * v_loss.unit_cost;
  v_new_recovered := v_loss.recovered_amount + p_amount;

  if v_new_recovered > v_total then
    raise exception 'Ce recouvrement dépasserait la valeur de la perte (reste à recouvrer : %)',
      v_total - v_loss.recovered_amount;
  end if;

  insert into public.purchase_loss_recoveries (purchase_loss_id, amount, user_id)
  values (v_loss.id, p_amount, auth.uid());

  update public.purchase_losses
  set recovered_amount = v_new_recovered
  where id = v_loss.id
  returning * into v_loss;

  select id into v_account_521 from public.chart_of_accounts where company_id = v_caller_company and code = '521';
  select id into v_account_4098 from public.chart_of_accounts where company_id = v_caller_company and code = '4098';

  if v_account_521 is null or v_account_4098 is null then
    raise exception 'Plan comptable incomplet pour cette société (comptes 521/4098 requis)';
  end if;

  insert into public.journal_entries (company_id, journal_code, description, purchase_id)
  values (v_caller_company, 'TRESORERIE', 'Recouvrement perte transport #' || left(v_loss.id::text, 8), v_loss.purchase_id)
  returning id into v_entry_id;

  insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
  values (v_entry_id, v_account_521, p_amount, 0);

  insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
  values (v_entry_id, v_account_4098, 0, p_amount);

  return v_loss;
end;
$$;

grant execute on function public.record_purchase_loss_recovery(uuid, numeric) to authenticated;
