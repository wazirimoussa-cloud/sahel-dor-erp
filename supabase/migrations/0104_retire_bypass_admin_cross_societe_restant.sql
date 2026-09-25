-- Retire le dernier contournement cross-société (current_role_name() = 'admin') encore
-- présent sur 4 policies -- le même motif déjà trouvé et corrigé 3 fois avant (voir
-- 0053_companies_admin_write_company_scope.sql, 0074_users_select_write_company_scope.sql,
-- 0101_scope_attributions_a_la_societe.sql), repéré lors d'un audit RLS demandé
-- explicitement par l'utilisateur (2026-09-25). Seul wazirimoussa@gmail.com
-- (role_id legacy = 1, 'admin') déclenchait ce contournement ; aucun compte Formation
-- n'était concerné. Décision de l'utilisateur : aligner ces 4 policies sur la posture
-- déjà appliquée partout ailleurs (scope strict par company_id, aucune visibilité
-- cross-société, y compris pour l'admin legacy).

drop policy if exists fiscal_rate_history_select on public.fiscal_rate_history;
create policy fiscal_rate_history_select on public.fiscal_rate_history
  for select to authenticated
  using (company_id = public.current_company_id());

drop policy if exists purchase_loss_recoveries_select on public.purchase_loss_recoveries;
create policy purchase_loss_recoveries_select on public.purchase_loss_recoveries
  for select to authenticated
  using (
    exists (
      select 1
      from public.purchase_losses pl
      join public.purchases p on p.id = pl.purchase_id
      where pl.id = purchase_loss_recoveries.purchase_loss_id
        and p.company_id = public.current_company_id()
    )
  );

drop policy if exists purchase_loss_writeoffs_select on public.purchase_loss_writeoffs;
create policy purchase_loss_writeoffs_select on public.purchase_loss_writeoffs
  for select to authenticated
  using (
    exists (
      select 1
      from public.purchase_losses pl
      join public.purchases p on p.id = pl.purchase_id
      where pl.id = purchase_loss_writeoffs.purchase_loss_id
        and p.company_id = public.current_company_id()
    )
  );

drop policy if exists purchase_transport_payments_select on public.purchase_transport_payments;
create policy purchase_transport_payments_select on public.purchase_transport_payments
  for select to authenticated
  using (
    exists (
      select 1
      from public.purchases p
      where p.id = purchase_transport_payments.purchase_id
        and p.company_id = public.current_company_id()
    )
  );
