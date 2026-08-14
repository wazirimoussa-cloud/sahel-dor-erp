-- Outil de remise à blanc de Formation, pour démarrer une session de formation sur des
-- données propres (0072_identifiants_login.sql avait déjà permis de repérer -- et cette
-- fonction permet de nettoyer -- l'accumulation de données de test créées par les mois de
-- tests d'intégration de ce projet : ~560 produits, ~970 écritures comptables, ~800
-- mouvements de stock, etc.).
--
-- Portée volontairement figée en dur sur le company_id de Formation (jamais un paramètre)
-- -- rend structurellement impossible d'invoquer accidentellement cette fonction contre
-- Production. Supprime TOUTES les données métier de Formation (produits, magasins,
-- fournisseurs, clients, transporteurs, achats, commandes, stock, écritures comptables,
-- immobilisations, employés/paie) et TOUS les comptes utilisateurs sauf les 5 profils de
-- formation (gerant/magasinier/superviseur/comptable/admin.formation) -- décision
-- explicitement confirmée avec l'utilisateur. Garde : la société elle-même, le plan
-- comptable, les rôles/attributions (catalogue), les paramètres fiscaux -- configuration,
-- pas "données saisies".
--
-- Contourne les triggers d'immutabilité (fn_block_mutation, voir 0018/0020/0033 etc. --
-- append-only par conception, jamais affaibli en permanence) en les désactivant le temps
-- de la purge, à l'intérieur de la transaction implicite de la fonction : tout échec
-- annule tout (y compris la désactivation des triggers), aucun état partiel possible.
--
-- p_dry_run (défaut true) : ne fait AUCUNE modification, retourne uniquement les comptes
-- de lignes qui seraient affectées -- toujours prévisualiser avant d'exécuter pour de bon.
--
-- EXECUTE volontairement PAS accordé à anon/authenticated : uniquement invocable via un
-- accès direct à la base (CLI liée), jamais depuis l'application.

create or replace function public.reset_formation_data(p_dry_run boolean default true)
returns table(table_name text, rows_affected bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id constant uuid := '00000000-0000-0000-0000-0000000000f0';
  v_keep_logins constant text[] := array[
    'gerant.formation', 'magasinier.formation', 'superviseur.formation',
    'comptable.formation', 'admin.formation'
  ];
  v_users_to_delete uuid[];
  v_count bigint;
begin
  if v_company_id != '00000000-0000-0000-0000-0000000000f0' then
    raise exception 'Garde-fou : company_id inattendu, abandon.';
  end if;

  select array_agg(id) into v_users_to_delete
  from public.users
  where company_id = v_company_id and login <> all(v_keep_logins);

  if not p_dry_run then
    alter table order_payments disable trigger trg_order_payments_immutable;
    alter table purchase_losses disable trigger trg_purchase_losses_immutable;
    alter table product_price_history disable trigger trg_product_price_history_immutable;
    alter table payslips disable trigger trg_payslips_immutable;
    alter table salary_advances disable trigger trg_salary_advances_immutable;
    alter table stock_loss_requests disable trigger trg_stock_loss_requests_immutable;
    alter table transaction_lot_allocations disable trigger trg_transaction_lot_allocations_immutable;
    alter table transactions disable trigger trg_transactions_immutable;
    alter table journal_entry_lines disable trigger trg_journal_entry_lines_immutable;
    alter table journal_entries disable trigger trg_journal_entries_immutable;
    alter table logs disable trigger trg_logs_immutable;
  end if;

  -- journal_entries D'ABORD : référence orders/payslips/productions/purchases/
  -- transformations -- doit disparaître avant que l'un de ces cinq ne soit supprimé plus
  -- loin, sinon violation de FK (observé : journal_entries.payslip_id bloquait la
  -- suppression de payslips). journal_entry_lines supprimée explicitement plutôt que de
  -- compter sur le ON DELETE CASCADE : Postgres refuse de RÉ-ACTIVER un trigger sur une
  -- table ayant reçu un DELETE en cascade dans la même transaction ("pending trigger
  -- events", erreur 55006) -- une suppression explicite, trigger déjà désactivé, évite
  -- ce piège.
  select count(*) into v_count from journal_entries where company_id = v_company_id;
  return query select 'journal_entries'::text, v_count;
  if not p_dry_run then
    delete from journal_entry_lines where entry_id in (select id from journal_entries where company_id = v_company_id);
    delete from journal_entries where company_id = v_company_id;
  end if;

  -- Round 1 : tables feuilles (rien d'autre ne les référence).
  select count(*) into v_count from order_payments where order_id in (select id from orders where company_id = v_company_id);
  return query select 'order_payments'::text, v_count;
  if not p_dry_run then delete from order_payments where order_id in (select id from orders where company_id = v_company_id); end if;

  select count(*) into v_count from purchase_losses where purchase_id in (select id from purchases where company_id = v_company_id);
  return query select 'purchase_losses'::text, v_count;
  if not p_dry_run then delete from purchase_losses where purchase_id in (select id from purchases where company_id = v_company_id); end if;

  select count(*) into v_count from product_price_history where product_id in (select id from products where company_id = v_company_id);
  return query select 'product_price_history'::text, v_count;
  if not p_dry_run then delete from product_price_history where product_id in (select id from products where company_id = v_company_id); end if;

  select count(*) into v_count from product_stocks where product_id in (select id from products where company_id = v_company_id);
  return query select 'product_stocks'::text, v_count;
  if not p_dry_run then delete from product_stocks where product_id in (select id from products where company_id = v_company_id); end if;

  select count(*) into v_count from payslips where company_id = v_company_id;
  return query select 'payslips'::text, v_count;
  if not p_dry_run then delete from payslips where company_id = v_company_id; end if;

  select count(*) into v_count from salary_advances where employee_id in (select id from employees where company_id = v_company_id);
  return query select 'salary_advances'::text, v_count;
  if not p_dry_run then delete from salary_advances where employee_id in (select id from employees where company_id = v_company_id); end if;

  select count(*) into v_count from leave_records where company_id = v_company_id;
  return query select 'leave_records'::text, v_count;
  if not p_dry_run then delete from leave_records where company_id = v_company_id; end if;

  select count(*) into v_count from logs where user_id in (select id from users where company_id = v_company_id);
  return query select 'logs'::text, v_count;
  if not p_dry_run then delete from logs where user_id in (select id from users where company_id = v_company_id); end if;

  select count(*) into v_count from transaction_lot_allocations
    where lot_id in (select id from stock_lots where company_id = v_company_id);
  return query select 'transaction_lot_allocations'::text, v_count;
  if not p_dry_run then
    delete from transaction_lot_allocations where lot_id in (select id from stock_lots where company_id = v_company_id);
  end if;

  select count(*) into v_count from stock_loss_requests where company_id = v_company_id;
  return query select 'stock_loss_requests'::text, v_count;
  if not p_dry_run then delete from stock_loss_requests where company_id = v_company_id; end if;

  select count(*) into v_count from fixed_assets where company_id = v_company_id;
  return query select 'fixed_assets'::text, v_count;
  if not p_dry_run then delete from fixed_assets where company_id = v_company_id; end if;

  -- Round 3-5 : casse le cycle transactions<->stock_lots avant de les supprimer.
  select count(*) into v_count from transactions t join products p on p.id = t.product_id where p.company_id = v_company_id;
  return query select 'transactions'::text, v_count;
  if not p_dry_run then
    update transactions set target_lot_id = null
      where product_id in (select id from products where company_id = v_company_id);
  end if;

  select count(*) into v_count from stock_lots where company_id = v_company_id;
  return query select 'stock_lots'::text, v_count;
  if not p_dry_run then delete from stock_lots where company_id = v_company_id; end if;

  if not p_dry_run then
    delete from transactions where product_id in (select id from products where company_id = v_company_id);
  end if;

  -- Round 6 : achats/ventes/production/transformation (leurs lignes suivent en cascade).
  select count(*) into v_count from orders where company_id = v_company_id;
  return query select 'orders'::text, v_count;
  if not p_dry_run then delete from orders where company_id = v_company_id; end if;

  select count(*) into v_count from productions where company_id = v_company_id;
  return query select 'productions'::text, v_count;
  if not p_dry_run then delete from productions where company_id = v_company_id; end if;

  select count(*) into v_count from purchases where company_id = v_company_id;
  return query select 'purchases'::text, v_count;
  if not p_dry_run then delete from purchases where company_id = v_company_id; end if;

  select count(*) into v_count from transformations where company_id = v_company_id;
  return query select 'transformations'::text, v_count;
  if not p_dry_run then delete from transformations where company_id = v_company_id; end if;

  -- Round 7 : référentiels métier.
  select count(*) into v_count from products where company_id = v_company_id;
  return query select 'products'::text, v_count;
  if not p_dry_run then delete from products where company_id = v_company_id; end if;

  select count(*) into v_count from suppliers where company_id = v_company_id;
  return query select 'suppliers'::text, v_count;
  if not p_dry_run then delete from suppliers where company_id = v_company_id; end if;

  select count(*) into v_count from clients where company_id = v_company_id;
  return query select 'clients'::text, v_count;
  if not p_dry_run then delete from clients where company_id = v_company_id; end if;

  select count(*) into v_count from transporters where company_id = v_company_id;
  return query select 'transporters'::text, v_count;
  if not p_dry_run then delete from transporters where company_id = v_company_id; end if;

  select count(*) into v_count from warehouses where company_id = v_company_id;
  return query select 'warehouses'::text, v_count;
  if not p_dry_run then delete from warehouses where company_id = v_company_id; end if;

  select count(*) into v_count from employees where company_id = v_company_id;
  return query select 'employees'::text, v_count;
  if not p_dry_run then delete from employees where company_id = v_company_id; end if;

  -- Round 8 : comptes utilisateurs -- tous sauf les 5 profils de formation.
  return query select 'users_to_delete'::text, coalesce(array_length(v_users_to_delete, 1), 0)::bigint;
  if not p_dry_run then
    update user_attributions set granted_by = null where granted_by = any(v_users_to_delete);
    delete from public.users where id = any(v_users_to_delete);
    delete from auth.users where id = any(v_users_to_delete);
  end if;

  -- Réactivation des triggers volontairement PAS ici : Postgres refuse de rebasculer
  -- l'état d'un trigger sur une table ayant reçu des suppressions dans la même
  -- transaction ("pending trigger events", erreur 55006) -- confirmé en pratique sur
  -- journal_entry_lines, même avec une suppression explicite plutôt qu'une cascade.
  -- Réactivation faite par public.reenable_immutable_triggers(), appelée séparément
  -- juste après un run réel réussi (nouvelle transaction).
end;
$$;

create or replace function public.reenable_immutable_triggers()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  alter table order_payments enable trigger trg_order_payments_immutable;
  alter table purchase_losses enable trigger trg_purchase_losses_immutable;
  alter table product_price_history enable trigger trg_product_price_history_immutable;
  alter table payslips enable trigger trg_payslips_immutable;
  alter table salary_advances enable trigger trg_salary_advances_immutable;
  alter table stock_loss_requests enable trigger trg_stock_loss_requests_immutable;
  alter table transaction_lot_allocations enable trigger trg_transaction_lot_allocations_immutable;
  alter table transactions enable trigger trg_transactions_immutable;
  alter table journal_entry_lines enable trigger trg_journal_entry_lines_immutable;
  alter table journal_entries enable trigger trg_journal_entries_immutable;
  alter table logs enable trigger trg_logs_immutable;
end;
$$;

revoke all on function public.reenable_immutable_triggers() from public, anon, authenticated;

revoke all on function public.reset_formation_data(boolean) from public, anon, authenticated;
