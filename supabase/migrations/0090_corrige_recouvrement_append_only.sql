-- Corrige un bug de 0089, trouvé en vérification live (pas en production — aucune vraie
-- donnée touchée) : record_purchase_loss_recovery faisait un `update purchase_losses set
-- recovered_amount = ...`, alors que purchase_losses est déjà en append-only depuis
-- 0020_transporters_purchase_losses.sql (trigger trg_purchase_losses_immutable, before
-- update or delete -> fn_block_mutation). La colonne recovered_amount ajoutée par 0089 ne
-- pouvait donc jamais être mise à jour -- le montant recouvré doit être calculé par somme
-- des lignes purchase_loss_recoveries (déjà append-only, source de vérité), jamais stocké
-- sur la ligne immuable.

alter table public.purchase_losses drop column recovered_amount;

drop function if exists public.record_purchase_loss_recovery(uuid, numeric);

create or replace function public.record_purchase_loss_recovery(p_loss_id uuid, p_amount numeric)
returns public.purchase_loss_recoveries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_company uuid := public.current_company_id();
  v_loss public.purchase_losses;
  v_purchase_company uuid;
  v_total numeric(14, 2);
  v_already_recovered numeric(14, 2);
  v_account_521 uuid;
  v_account_4098 uuid;
  v_entry_id uuid;
  v_recovery public.purchase_loss_recoveries;
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

  select coalesce(sum(amount), 0) into v_already_recovered
  from public.purchase_loss_recoveries
  where purchase_loss_id = v_loss.id;

  v_total := v_loss.quantity_lost * v_loss.unit_cost;

  if v_already_recovered + p_amount > v_total then
    raise exception 'Ce recouvrement dépasserait la valeur de la perte (reste à recouvrer : %)',
      v_total - v_already_recovered;
  end if;

  insert into public.purchase_loss_recoveries (purchase_loss_id, amount, user_id)
  values (v_loss.id, p_amount, auth.uid())
  returning * into v_recovery;

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

  return v_recovery;
end;
$$;

grant execute on function public.record_purchase_loss_recovery(uuid, numeric) to authenticated;
