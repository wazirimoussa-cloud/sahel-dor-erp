-- Retenue sur le transport : le transporteur est payé en 2 fois (avance au départ des
-- camions, solde à la livraison/déchargement) -- décision confirmée avec l'utilisateur :
-- en cas de perte constatée, le montant de la perte est déduit du solde (2ᵉ moitié) plutôt
-- que de rester une créance séparée à recouvrer en espèces. Jusqu'ici l'app ne suivait même
-- pas le coût du transport lui-même (seulement la valeur des marchandises perdues, 0089) --
-- transporteur/montant devaient donc être connus dès la création du bon d'achat (pas
-- seulement à la réception comme pour la déclaration de perte) pour pouvoir payer l'avance
-- avant le départ.
--
-- Répartition confirmée avec l'utilisateur : "première partie"/"la seconde moitié" -> 50/50
-- fixe (pas de répartition configurable). Si la perte dépasse le solde disponible,
-- l'excédent reste une créance -- traité via le mécanisme de recouvrement déjà existant
-- (compte 4098, record_purchase_loss_recovery, 0089/0090), qui continue de fonctionner sans
-- modification pour : (a) cet excédent, (b) les transporteurs sans montant de transport
-- renseigné (retour intégral au comportement actuel).
--
-- Compte 611 "Transports sur achats" (confirmé via plan-comptable-ohada.com/compte/61) --
-- famille 61 "Transports", cohérent avec le contexte (transport de marchandises achetées
-- jusqu'au magasin).

insert into public.chart_of_accounts (company_id, code, name)
select id, '611', 'Transports sur achats' from public.companies
on conflict (company_id, code) do nothing;

alter table public.purchases
  add column transporter_id uuid references public.transporters (id),
  add column transport_fee numeric(12, 2) check (transport_fee is null or transport_fee > 0),
  add constraint purchases_transport_fee_requires_transporter
    check ((transporter_id is null) = (transport_fee is null));

create table public.purchase_transport_payments (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases (id),
  installment text not null check (installment in ('avance', 'solde')),
  amount numeric(12, 2) not null check (amount >= 0),
  user_id uuid not null references public.users (id),
  created_at timestamptz not null default now(),
  unique (purchase_id, installment)
);

create index purchase_transport_payments_purchase_id_idx on public.purchase_transport_payments (purchase_id);

alter table public.purchase_transport_payments enable row level security;

-- Même patron que purchase_loss_recoveries (0089) : lecture scopée société via le bon
-- d'achat, écriture exclusivement via pay_transport_advance/pay_transport_balance
-- (SECURITY DEFINER) -- aucune policy insert/update. Append-only (montant >= 0 : le solde
-- peut légitimement être 0 si la perte absorbe tout le montant dû).
create policy purchase_transport_payments_select on public.purchase_transport_payments
  for select to authenticated
  using (
    exists (
      select 1
      from public.purchases p
      where p.id = purchase_transport_payments.purchase_id
        and (public.current_role_name() = 'admin' or p.company_id = public.current_company_id())
    )
  );

create trigger trg_purchase_transport_payments_immutable
  before update or delete on public.purchase_transport_payments
  for each row execute function public.fn_block_mutation();

-- Distingue un recouvrement encaissé en espèces (record_purchase_loss_recovery, 0089) d'une
-- déduction sur le solde transport (pay_transport_balance, ci-dessous) -- affiché
-- différemment dans l'historique de PurchaseLossesPage.tsx. Défaut 'cash' pour les lignes
-- déjà existantes, jamais réécrites (append-only).
alter table public.purchase_loss_recoveries
  add column source text not null default 'cash' check (source in ('cash', 'solde_transport'));

-- create_purchase : copie verbatim de 0085_corrige_fallback_prix_unitaire_defaut.sql,
-- transporteur/montant de transport optionnels ajoutés (connus dès la création pour pouvoir
-- payer l'avance avant le départ des camions -- jusqu'ici le transporteur n'était saisi qu'à
-- la réception, et seulement en cas de perte).
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
  v_transporter_id uuid := (payload ->> 'transporter_id')::uuid;
  v_transport_fee numeric(12, 2) := (payload ->> 'transport_fee')::numeric;
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

  if v_transporter_id is not null and not exists (
    select 1 from public.transporters t where t.id = v_transporter_id and t.company_id = v_caller_company
  ) then
    raise exception 'Transporteur introuvable pour cette société';
  end if;

  if v_transport_fee is not null and v_transport_fee <= 0 then
    raise exception 'Le montant du transport doit être positif';
  end if;

  insert into public.purchases (company_id, supplier_id, warehouse_id, user_id, status, transporter_id, transport_fee)
  values (v_caller_company, v_supplier_id, v_warehouse_id, auth.uid(), 'pending', v_transporter_id, v_transport_fee)
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
      coalesce((v_item ->> 'unit_cost')::numeric, v_product.unit_cost)
    );
  end loop;

  return v_purchase;
end;
$$;

-- Paie l'avance (1ère moitié, au départ des camions) -- montant toujours dérivé de
-- transport_fee/2, jamais fourni par l'appelant (source de vérité unique). Autorisation
-- transporteurs.gerer, comme record_purchase_loss_recovery : c'est une opération financière
-- envers le transporteur, pas une réception d'achat.
create or replace function public.pay_transport_advance(p_purchase_id uuid)
returns public.purchase_transport_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_company uuid := public.current_company_id();
  v_purchase public.purchases;
  v_amount numeric(12, 2);
  v_account_611 uuid;
  v_account_521 uuid;
  v_entry_id uuid;
  v_payment public.purchase_transport_payments;
begin
  if not public.has_attribution('transporteurs.gerer') then
    raise exception 'Non autorisé à payer le transport';
  end if;

  select * into v_purchase from public.purchases where id = p_purchase_id;

  if v_purchase is null then
    raise exception 'Achat introuvable';
  end if;

  if v_purchase.company_id is distinct from v_caller_company then
    raise exception 'Impossible de payer le transport d''un achat d''une autre société';
  end if;

  if v_purchase.transport_fee is null then
    raise exception 'Aucun montant de transport renseigné pour ce bon d''achat';
  end if;

  if exists (
    select 1 from public.purchase_transport_payments
    where purchase_id = p_purchase_id and installment = 'avance'
  ) then
    raise exception 'L''avance transport a déjà été payée pour ce bon d''achat';
  end if;

  v_amount := round(v_purchase.transport_fee / 2, 2);

  select id into v_account_611 from public.chart_of_accounts where company_id = v_caller_company and code = '611';
  select id into v_account_521 from public.chart_of_accounts where company_id = v_caller_company and code = '521';

  if v_account_611 is null or v_account_521 is null then
    raise exception 'Plan comptable incomplet pour cette société (comptes 611/521 requis)';
  end if;

  insert into public.journal_entries (company_id, journal_code, description, purchase_id)
  values (v_caller_company, 'TRESORERIE', 'Avance transport — bon d''achat #' || left(p_purchase_id::text, 8), p_purchase_id)
  returning id into v_entry_id;

  insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
  values (v_entry_id, v_account_611, v_amount, 0);

  insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
  values (v_entry_id, v_account_521, 0, v_amount);

  insert into public.purchase_transport_payments (purchase_id, installment, amount, user_id)
  values (p_purchase_id, 'avance', v_amount, auth.uid())
  returning * into v_payment;

  return v_payment;
end;
$$;

-- Paie le solde (2ᵉ moitié, à la livraison) -- déduit automatiquement les pertes constatées
-- sur ce bon d'achat (purchase_losses) du montant dû. L'exigence "l'avance doit être payée
-- avant le solde" reflète l'ordre réel du processus décrit par l'utilisateur.
--
-- Répartition comptable (pour que la somme reste équilibrée sur une seule écriture) :
--   - 611 débité du solde PRÉVU en entier (le service de transport a bien été rendu en
--     totalité, quel que soit son mode de règlement) ;
--   - 521 crédité du montant réellement décaissé (solde prévu - déduction) ;
--   - 4098 crédité de la déduction (réduit la créance transporteur déjà comptabilisée à la
--     réception par receive_purchase() -- c'est un recouvrement par compensation, pas en
--     espèces).
-- La déduction est répartie (FIFO par date) sur les lignes purchase_losses de ce bon
-- d'achat, comme des lignes purchase_loss_recoveries de source 'solde_transport' -- garantit
-- que record_purchase_loss_recovery() (qui somme purchase_loss_recoveries par perte, toutes
-- sources confondues) ne permette jamais un recouvrement en espèces au-delà du reste
-- réellement dû après cette déduction. L'éventuel excédent (perte > solde disponible) reste
-- donc dans purchase_losses avec un solde non recouvert, exactement comme avant cette
-- migration -- récupérable via ce même mécanisme existant, aucun changement requis.
create or replace function public.pay_transport_balance(p_purchase_id uuid)
returns public.purchase_transport_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_company uuid := public.current_company_id();
  v_purchase public.purchases;
  v_solde_prevu numeric(12, 2);
  v_pertes_totales numeric(14, 2);
  v_montant_paye numeric(12, 2);
  v_montant_deduit numeric(12, 2);
  v_reste_a_deduire numeric(14, 2);
  v_loss record;
  v_deja_recouvre numeric(14, 2);
  v_loss_restant numeric(14, 2);
  v_allocation numeric(14, 2);
  v_account_611 uuid;
  v_account_521 uuid;
  v_account_4098 uuid;
  v_entry_id uuid;
  v_payment public.purchase_transport_payments;
begin
  if not public.has_attribution('transporteurs.gerer') then
    raise exception 'Non autorisé à payer le transport';
  end if;

  select * into v_purchase from public.purchases where id = p_purchase_id;

  if v_purchase is null then
    raise exception 'Achat introuvable';
  end if;

  if v_purchase.company_id is distinct from v_caller_company then
    raise exception 'Impossible de payer le transport d''un achat d''une autre société';
  end if;

  if v_purchase.transport_fee is null then
    raise exception 'Aucun montant de transport renseigné pour ce bon d''achat';
  end if;

  if not exists (
    select 1 from public.purchase_transport_payments
    where purchase_id = p_purchase_id and installment = 'avance'
  ) then
    raise exception 'L''avance transport doit être payée avant le solde';
  end if;

  if exists (
    select 1 from public.purchase_transport_payments
    where purchase_id = p_purchase_id and installment = 'solde'
  ) then
    raise exception 'Le solde transport a déjà été payé pour ce bon d''achat';
  end if;

  v_solde_prevu := round(v_purchase.transport_fee / 2, 2);

  select coalesce(sum(quantity_lost * unit_cost), 0) into v_pertes_totales
  from public.purchase_losses
  where purchase_id = p_purchase_id;

  v_montant_deduit := least(v_solde_prevu, v_pertes_totales);
  v_montant_paye := v_solde_prevu - v_montant_deduit;

  select id into v_account_611 from public.chart_of_accounts where company_id = v_caller_company and code = '611';
  select id into v_account_521 from public.chart_of_accounts where company_id = v_caller_company and code = '521';

  if v_account_611 is null or v_account_521 is null then
    raise exception 'Plan comptable incomplet pour cette société (comptes 611/521 requis)';
  end if;

  insert into public.journal_entries (company_id, journal_code, description, purchase_id)
  values (v_caller_company, 'TRESORERIE', 'Solde transport — bon d''achat #' || left(p_purchase_id::text, 8), p_purchase_id)
  returning id into v_entry_id;

  insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
  values (v_entry_id, v_account_611, v_solde_prevu, 0);

  if v_montant_paye > 0 then
    insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
    values (v_entry_id, v_account_521, 0, v_montant_paye);
  end if;

  if v_montant_deduit > 0 then
    select id into v_account_4098 from public.chart_of_accounts where company_id = v_caller_company and code = '4098';

    if v_account_4098 is null then
      raise exception 'Plan comptable incomplet pour cette société (compte 4098 requis)';
    end if;

    insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
    values (v_entry_id, v_account_4098, 0, v_montant_deduit);

    v_reste_a_deduire := v_montant_deduit;

    for v_loss in
      select id, quantity_lost * unit_cost as total
      from public.purchase_losses
      where purchase_id = p_purchase_id
      order by created_at
    loop
      exit when v_reste_a_deduire <= 0;

      select coalesce(sum(amount), 0) into v_deja_recouvre
      from public.purchase_loss_recoveries
      where purchase_loss_id = v_loss.id;

      v_loss_restant := v_loss.total - v_deja_recouvre;

      if v_loss_restant > 0 then
        v_allocation := least(v_loss_restant, v_reste_a_deduire);

        insert into public.purchase_loss_recoveries (purchase_loss_id, amount, user_id, source)
        values (v_loss.id, v_allocation, auth.uid(), 'solde_transport');

        v_reste_a_deduire := v_reste_a_deduire - v_allocation;
      end if;
    end loop;
  end if;

  insert into public.purchase_transport_payments (purchase_id, installment, amount, user_id)
  values (p_purchase_id, 'solde', v_montant_paye, auth.uid())
  returning * into v_payment;

  return v_payment;
end;
$$;

grant execute on function public.pay_transport_advance(uuid) to authenticated;
grant execute on function public.pay_transport_balance(uuid) to authenticated;
