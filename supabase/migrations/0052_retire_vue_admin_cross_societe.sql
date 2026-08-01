-- Retrait de la vue cross-société de l'admin : 25 policies SELECT gardaient une
-- clause `current_role_name() = 'admin' OR ...`, reliquat de l'ancien rôle fixe
-- `admin` (avant 0032_attributions.sql) qui donnait une vue sur toutes les sociétés à
-- la fois. Confirmé avec l'utilisateur que ça n'a plus de sens maintenant que
-- Formation et Production sont délibérément séparées partout ailleurs dans l'app —
-- retirée, pas remplacée par une attribution. current_role_name() elle-même n'est pas
-- modifiée, seule son utilisation dans ces 25 policies disparaît. Le fallback normal
-- (company_id = current_company_id(), ou l'attribution déjà présente selon la table)
-- continue de gouverner l'accès inchangé pour tous les profils réels (role_id est déjà
-- null partout depuis le passage aux attributions -- cette clause ne s'activait plus
-- pour aucun compte).

drop policy if exists chart_of_accounts_select on public.chart_of_accounts;
create policy chart_of_accounts_select on public.chart_of_accounts
  for select to authenticated
  using (company_id = current_company_id());

drop policy if exists clients_select on public.clients;
create policy clients_select on public.clients
  for select to authenticated
  using (company_id = current_company_id());

drop policy if exists companies_select on public.companies;
create policy companies_select on public.companies
  for select to authenticated
  using (id = current_company_id());

drop policy if exists journal_entries_select on public.journal_entries;
create policy journal_entries_select on public.journal_entries
  for select to authenticated
  using (has_attribution('journal_comptable.consulter', 'consultative') and company_id = current_company_id());

drop policy if exists journal_entry_lines_select on public.journal_entry_lines;
create policy journal_entry_lines_select on public.journal_entry_lines
  for select to authenticated
  using (
    exists (
      select 1 from journal_entries e
      where e.id = journal_entry_lines.entry_id
        and has_attribution('journal_comptable.consulter', 'consultative')
        and e.company_id = current_company_id()
    )
  );

drop policy if exists logs_select on public.logs;
create policy logs_select on public.logs
  for select to authenticated
  using (
    has_attribution('journal_audit.consulter', 'consultative')
    and exists (select 1 from users u where u.id = logs.user_id and u.company_id = current_company_id())
  );

drop policy if exists order_items_select on public.order_items;
create policy order_items_select on public.order_items
  for select to authenticated
  using (
    exists (select 1 from orders o where o.id = order_items.order_id and o.company_id = current_company_id())
  );

drop policy if exists order_payments_select on public.order_payments;
create policy order_payments_select on public.order_payments
  for select to authenticated
  using (
    exists (select 1 from orders o where o.id = order_payments.order_id and o.company_id = current_company_id())
  );

drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders
  for select to authenticated
  using (company_id = current_company_id());

drop policy if exists product_price_history_select on public.product_price_history;
create policy product_price_history_select on public.product_price_history
  for select to authenticated
  using (
    exists (select 1 from products p where p.id = product_price_history.product_id and p.company_id = current_company_id())
  );

drop policy if exists product_stocks_select on public.product_stocks;
create policy product_stocks_select on public.product_stocks
  for select to authenticated
  using (
    exists (select 1 from warehouses w where w.id = product_stocks.warehouse_id and w.company_id = current_company_id())
  );

drop policy if exists production_items_select on public.production_items;
create policy production_items_select on public.production_items
  for select to authenticated
  using (
    exists (select 1 from productions p where p.id = production_items.production_id and p.company_id = current_company_id())
  );

drop policy if exists productions_select on public.productions;
create policy productions_select on public.productions
  for select to authenticated
  using (company_id = current_company_id());

drop policy if exists products_select on public.products;
create policy products_select on public.products
  for select to authenticated
  using (company_id = current_company_id());

drop policy if exists purchase_items_select on public.purchase_items;
create policy purchase_items_select on public.purchase_items
  for select to authenticated
  using (
    exists (select 1 from purchases p where p.id = purchase_items.purchase_id and p.company_id = current_company_id())
  );

drop policy if exists purchase_losses_select on public.purchase_losses;
create policy purchase_losses_select on public.purchase_losses
  for select to authenticated
  using (
    exists (select 1 from purchases p where p.id = purchase_losses.purchase_id and p.company_id = current_company_id())
  );

drop policy if exists purchases_select on public.purchases;
create policy purchases_select on public.purchases
  for select to authenticated
  using (company_id = current_company_id());

drop policy if exists suppliers_select on public.suppliers;
create policy suppliers_select on public.suppliers
  for select to authenticated
  using (company_id = current_company_id());

drop policy if exists transactions_select on public.transactions;
create policy transactions_select on public.transactions
  for select to authenticated
  using (
    exists (select 1 from products p where p.id = transactions.product_id and p.company_id = current_company_id())
  );

drop policy if exists transformation_inputs_select on public.transformation_inputs;
create policy transformation_inputs_select on public.transformation_inputs
  for select to authenticated
  using (
    exists (select 1 from transformations t where t.id = transformation_inputs.transformation_id and t.company_id = current_company_id())
  );

drop policy if exists transformation_outputs_select on public.transformation_outputs;
create policy transformation_outputs_select on public.transformation_outputs
  for select to authenticated
  using (
    exists (select 1 from transformations t where t.id = transformation_outputs.transformation_id and t.company_id = current_company_id())
  );

drop policy if exists transformations_select on public.transformations;
create policy transformations_select on public.transformations
  for select to authenticated
  using (company_id = current_company_id());

drop policy if exists transporters_select on public.transporters;
create policy transporters_select on public.transporters
  for select to authenticated
  using (company_id = current_company_id());

drop policy if exists users_select on public.users;
create policy users_select on public.users
  for select to authenticated
  using (id = auth.uid() or has_attribution('utilisateurs.gerer'));

drop policy if exists warehouses_select on public.warehouses;
create policy warehouses_select on public.warehouses
  for select to authenticated
  using (company_id = current_company_id());
