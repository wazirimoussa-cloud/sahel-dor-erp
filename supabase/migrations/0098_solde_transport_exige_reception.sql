-- Garde-fou manquant dans 0097 : pay_transport_balance() ne vérifiait pas que le bon
-- d'achat était bien réceptionné avant de payer le solde. Or les pertes ne sont connues
-- qu'à la réception (purchase_losses n'est peuplée que par receive_purchase()) -- payer le
-- solde avant réception aurait silencieusement payé le montant plein (aucune perte encore
-- enregistrée), sans jamais rattraper une perte constatée ensuite. Cohérent avec la
-- description du processus : le solde se règle "une fois que les camions ont livré et
-- déchargé", pas avant.

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

  if v_purchase.status <> 'received' then
    raise exception 'Le solde transport ne peut être payé qu''après réception du bon d''achat';
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
