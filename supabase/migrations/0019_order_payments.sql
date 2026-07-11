-- Phase 12 : paiements partiels avec historique auditable, et correction d'une
-- régression comptable.
--
-- Bug corrigé : record_payment (0011/0012) générait une écriture TRESORERIE (521/411) à
-- chaque paiement ; cette logique a été perdue lors des réécritures de rôles en
-- 0014/0016, qui ne font plus qu'un UPDATE orders sans impact sur le grand livre. Un
-- paiement enregistré depuis restait donc invisible au Bilan (compte 521 sous-évalué).
--
-- Nouveau modèle : chaque paiement devient une ligne append-only dans order_payments
-- (même immutabilité que transactions/logs), le montant versé total et le statut de
-- paiement de la commande sont recalculés automatiquement à partir de la somme de ces
-- lignes — l'appelant ne fournit plus qu'un montant reçu, jamais un nouveau total.

create table public.order_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  amount numeric(12, 2) not null check (amount > 0),
  user_id uuid not null references public.users (id),
  created_at timestamptz not null default now()
);

create index order_payments_order_id_idx on public.order_payments (order_id);

alter table public.order_payments enable row level security;

-- Lecture large scopée société (même philosophie que orders_select), écriture
-- exclusivement via record_payment (SECURITY DEFINER) — aucune policy insert/update.
create policy order_payments_select on public.order_payments
  for select to authenticated
  using (
    exists (
      select 1
      from public.orders o
      where o.id = order_payments.order_id
        and (public.current_role_name() = 'admin' or o.company_id = public.current_company_id())
    )
  );

create trigger trg_order_payments_immutable
  before update or delete on public.order_payments
  for each row execute function public.fn_block_mutation();

-- Continuité : une ligne par commande déjà partiellement/totalement payée avant cette
-- migration, pour que le nouveau calcul par somme des paiements reparte du bon total.
insert into public.order_payments (order_id, amount, user_id, created_at)
select id, amount_paid, user_id, created_at
from public.orders
where amount_paid > 0;

-- Rattrapage ponctuel : la commande déjà identifiée comme affectée par le bug (payée
-- mais sans écriture TRESORERIE) reçoit son écriture manquante, pour que le Bilan
-- reflète enfin la trésorerie réellement encaissée.
do $$
declare
  v_order record;
  v_account_521 uuid;
  v_account_411 uuid;
  v_entry_id uuid;
begin
  for v_order in
    select o.id, o.company_id, o.amount_paid
    from public.orders o
    where o.amount_paid > 0
      and not exists (
        select 1 from public.journal_entries je
        where je.order_id = o.id and je.journal_code = 'TRESORERIE'
      )
  loop
    select id into v_account_521 from public.chart_of_accounts where company_id = v_order.company_id and code = '521';
    select id into v_account_411 from public.chart_of_accounts where company_id = v_order.company_id and code = '411';

    if v_account_521 is not null and v_account_411 is not null then
      insert into public.journal_entries (company_id, journal_code, description, order_id)
      values (v_order.company_id, 'TRESORERIE', 'Rattrapage encaissement #' || left(v_order.id::text, 8), v_order.id)
      returning id into v_entry_id;

      insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
      values (v_entry_id, v_account_521, v_order.amount_paid, 0);

      insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
      values (v_entry_id, v_account_411, 0, v_order.amount_paid);
    end if;
  end loop;
end;
$$;

-- L'ancienne signature (order_id, payment_status, amount_paid) est retirée : Postgres
-- distingue les fonctions par signature, donc CREATE OR REPLACE avec une nouvelle
-- signature créerait une surcharge au lieu de remplacer l'ancienne.
drop function if exists public.record_payment(uuid, public.payment_status, numeric);

create or replace function public.record_payment(order_id uuid, amount numeric)
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
  v_total_ht numeric(14, 2) := 0;
  v_vat_rate numeric(5, 2);
  v_vat numeric(14, 2);
  v_total_ttc numeric(14, 2);
  v_already_paid numeric(14, 2);
  v_new_total numeric(14, 2);
  v_new_status public.payment_status;
  v_account_521 uuid;
  v_account_411 uuid;
  v_entry_id uuid;
begin
  if v_role is null or v_role <> 'accounting' then
    raise exception 'Rôle % non autorisé à enregistrer un paiement', coalesce(v_role, '(aucun)');
  end if;

  if amount is null or amount <= 0 then
    raise exception 'Le montant reçu doit être positif';
  end if;

  select * into v_order from public.orders o where o.id = record_payment.order_id;

  if v_order is null then
    raise exception 'Commande introuvable';
  end if;

  if v_order.company_id is distinct from v_caller_company then
    raise exception 'Impossible d''enregistrer un paiement pour une commande d''une autre société';
  end if;

  for v_item in select * from public.order_items where order_items.order_id = v_order.id
  loop
    v_total_ht := v_total_ht + (v_item.quantity * v_item.unit_price);
  end loop;

  select vat_rate into v_vat_rate from public.companies where id = v_order.company_id;
  v_vat := round(v_total_ht * v_vat_rate / 100, 2);
  v_total_ttc := v_total_ht + v_vat;

  select coalesce(sum(op.amount), 0) into v_already_paid
  from public.order_payments op where op.order_id = v_order.id;

  if v_already_paid + amount > v_total_ttc then
    raise exception 'Ce paiement dépasserait le montant total de la commande (reste à payer : %)',
      v_total_ttc - v_already_paid;
  end if;

  insert into public.order_payments (order_id, amount, user_id)
  values (v_order.id, amount, auth.uid());

  v_new_total := v_already_paid + amount;
  v_new_status := case
    when v_new_total >= v_total_ttc then 'paid'
    when v_new_total > 0 then 'partial'
    else 'unpaid'
  end;

  update public.orders
  set amount_paid = v_new_total, payment_status = v_new_status
  where id = v_order.id
  returning * into v_order;

  select id into v_account_521 from public.chart_of_accounts where company_id = v_order.company_id and code = '521';
  select id into v_account_411 from public.chart_of_accounts where company_id = v_order.company_id and code = '411';

  if v_account_521 is null or v_account_411 is null then
    raise exception 'Plan comptable incomplet pour cette société (comptes 521/411 requis)';
  end if;

  insert into public.journal_entries (company_id, journal_code, description, order_id)
  values (v_order.company_id, 'TRESORERIE', 'Encaissement #' || left(v_order.id::text, 8), v_order.id)
  returning id into v_entry_id;

  insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
  values (v_entry_id, v_account_521, amount, 0);

  insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
  values (v_entry_id, v_account_411, 0, amount);

  return v_order;
end;
$$;

grant execute on function public.record_payment(uuid, numeric) to authenticated;
