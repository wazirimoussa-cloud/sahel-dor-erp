-- Structure bancaire : distinction entre le compte qui reçoit les virements clients
-- (Banque d'opération) et un compte de fonctionnement alimenté par le premier pour les
-- dépenses (fournisseurs, frais généraux). Le mécanisme de "ravitaillement" entre les
-- deux comptes et l'enregistrement des dépenses restent hors périmètre de cette passe
-- (à cadrer séparément) — ceci ne prépare que la structure comptable : les 2 comptes et
-- le renommage du journal de trésorerie en "BANQUE" (le journal "CAISSE" est réservé
-- pour une future fonctionnalité de dépenses en espèces, aucune écriture n'y est
-- générée pour l'instant).

-- 1. Renomme le compte 521 existant (déjà celui débité par record_payment) en
--    "Banque d'opération" — aucun changement de code, aucune RPC à modifier pour ça.
update public.chart_of_accounts
set name = 'Banque d''opération'
where code = '521';

-- 2. Ajoute le compte "Banque de fonctionnement" (522) pour chaque société existante.
insert into public.chart_of_accounts (company_id, code, name)
select id, '522', 'Banque de fonctionnement' from public.companies
on conflict (company_id, code) do nothing;

-- 3. record_payment : le journal "TRESORERIE" devient "BANQUE" (l'encaissement client
--    est bien un mouvement du compte Banque d'opération) — logique métier inchangée.
create or replace function public.record_payment(order_id uuid, amount numeric)
returns public.orders
language plpgsql
security definer
set search_path = 'public'
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
  values (v_order.company_id, 'BANQUE', 'Encaissement #' || left(v_order.id::text, 8), v_order.id)
  returning id into v_entry_id;

  insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
  values (v_entry_id, v_account_521, amount, 0);

  insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
  values (v_entry_id, v_account_411, 0, amount);

  return v_order;
end;
$$;
