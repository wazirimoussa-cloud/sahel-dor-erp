-- Passage en perte définitive d'une créance transport non recouvrée (purchase_losses /
-- 4098 "Avoirs à recevoir"). Jusqu'ici, une perte jamais remboursée par le transporteur
-- restait indéfiniment au compte 4098 -- un actif fictif, sans jamais devenir une charge
-- réelle. Nouvelle action, volontairement distincte et plus contrôlée que le
-- recouvrement : geste financier irréversible (on renonce définitivement à la créance).

insert into public.chart_of_accounts (company_id, code, name)
select id, '654', 'Pertes sur créances irrécouvrables' from public.companies
on conflict (company_id, code) do nothing;

-- Nouvelle attribution dédiée, PAS de backfill automatique (contrairement au précédent de
-- comptabilite.consulter_prix_revient, 0044 -- ici l'enjeu est financier et irréversible,
-- pas une simple visibilité) : personne ne l'a par défaut, l'admin l'accorde
-- explicitement à qui de droit, séparément de transporteurs.gerer (qui gère déjà
-- transporteurs + recouvrement).
insert into public.attributions (module, action_key, label) values
  ('transporteurs', 'transporteurs.abandonner_creance', 'Passer une créance transport en perte définitive');

-- Append-only, même patron exact que purchase_loss_recoveries (0089/0090) : un passage en
-- perte peut être partiel, le motif est obligatoire (même garde-fou que
-- reject_stock_loss.rejection_reason).
create table public.purchase_loss_writeoffs (
  id uuid primary key default gen_random_uuid(),
  purchase_loss_id uuid not null references public.purchase_losses (id),
  amount numeric(12, 2) not null check (amount > 0),
  reason text not null,
  user_id uuid not null references public.users (id),
  created_at timestamptz not null default now()
);

create index purchase_loss_writeoffs_loss_id_idx on public.purchase_loss_writeoffs (purchase_loss_id);

alter table public.purchase_loss_writeoffs enable row level security;

create policy purchase_loss_writeoffs_select on public.purchase_loss_writeoffs
  for select to authenticated
  using (
    exists (
      select 1
      from public.purchase_losses pl
      join public.purchases p on p.id = pl.purchase_id
      where pl.id = purchase_loss_writeoffs.purchase_loss_id
        and (public.current_role_name() = 'admin' or p.company_id = public.current_company_id())
    )
  );

create trigger trg_purchase_loss_writeoffs_immutable
  before update or delete on public.purchase_loss_writeoffs
  for each row execute function public.fn_block_mutation();

-- record_purchase_loss_recovery (copie de 0090, seul le plafond change) : le montant déjà
-- passé en perte compte désormais aussi dans le plafond, pour ne jamais recouvrer plus que
-- ce qu'il reste après un write-off partiel.
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
  v_already_written_off numeric(14, 2);
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

  select coalesce(sum(amount), 0) into v_already_written_off
  from public.purchase_loss_writeoffs
  where purchase_loss_id = v_loss.id;

  v_total := v_loss.quantity_lost * v_loss.unit_cost;

  if v_already_recovered + v_already_written_off + p_amount > v_total then
    raise exception 'Ce recouvrement dépasserait le reste à recouvrer (reste : %)',
      v_total - v_already_recovered - v_already_written_off;
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

-- Passe le solde restant (ou une partie) d'une créance transport en perte définitive :
-- débite 654 (charge réelle, enfin visible en compte de résultat), crédite 4098 (solde la
-- créance à due concurrence). Limite assumée : si le transporteur rembourse après un
-- write-off total, aucune réouverture automatique -- record_purchase_loss_recovery refuse
-- simplement tout recouvrement une fois recouvré+passé en perte = total (cas rare,
-- correction manuelle si besoin).
create function public.write_off_purchase_loss(p_loss_id uuid, p_amount numeric, p_reason text)
returns public.purchase_loss_writeoffs
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
  v_already_written_off numeric(14, 2);
  v_account_654 uuid;
  v_account_4098 uuid;
  v_entry_id uuid;
  v_writeoff public.purchase_loss_writeoffs;
begin
  if not public.has_attribution('transporteurs.abandonner_creance') then
    raise exception 'Non autorisé à passer une créance transport en perte';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Le montant passé en perte doit être positif';
  end if;

  if trim(coalesce(p_reason, '')) = '' then
    raise exception 'Un motif est requis';
  end if;

  select * into v_loss from public.purchase_losses pl where pl.id = p_loss_id;

  if v_loss is null then
    raise exception 'Perte introuvable';
  end if;

  select p.company_id into v_purchase_company from public.purchases p where p.id = v_loss.purchase_id;

  if v_purchase_company is distinct from v_caller_company then
    raise exception 'Impossible de passer en perte une créance d''une autre société';
  end if;

  select coalesce(sum(amount), 0) into v_already_recovered
  from public.purchase_loss_recoveries
  where purchase_loss_id = v_loss.id;

  select coalesce(sum(amount), 0) into v_already_written_off
  from public.purchase_loss_writeoffs
  where purchase_loss_id = v_loss.id;

  v_total := v_loss.quantity_lost * v_loss.unit_cost;

  if v_already_recovered + v_already_written_off + p_amount > v_total then
    raise exception 'Ce passage en perte dépasserait le reste à recouvrer (reste : %)',
      v_total - v_already_recovered - v_already_written_off;
  end if;

  insert into public.purchase_loss_writeoffs (purchase_loss_id, amount, reason, user_id)
  values (v_loss.id, p_amount, p_reason, auth.uid())
  returning * into v_writeoff;

  select id into v_account_654 from public.chart_of_accounts where company_id = v_caller_company and code = '654';
  select id into v_account_4098 from public.chart_of_accounts where company_id = v_caller_company and code = '4098';

  if v_account_654 is null or v_account_4098 is null then
    raise exception 'Plan comptable incomplet pour cette société (comptes 654/4098 requis)';
  end if;

  insert into public.journal_entries (company_id, journal_code, description, purchase_id)
  values (v_caller_company, 'TRESORERIE', 'Passage en perte transport #' || left(v_loss.id::text, 8), v_loss.purchase_id)
  returning id into v_entry_id;

  insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
  values (v_entry_id, v_account_654, p_amount, 0);

  insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
  values (v_entry_id, v_account_4098, 0, p_amount);

  return v_writeoff;
end;
$$;

grant execute on function public.write_off_purchase_loss(uuid, numeric, text) to authenticated;
