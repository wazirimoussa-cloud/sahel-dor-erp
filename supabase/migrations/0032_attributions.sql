-- Attributions détachées du rôle (RBAC -> permissions granulaires).
--
-- Demande : l'attribution des rôles à la création d'un profil doit devenir optionnelle
-- -- l'administrateur crée le profil, puis lui attribue séparément les opérations qui
-- lui sont assignées. Plusieurs profils peuvent partager les mêmes attributions, et
-- l'admin choisit pour chacune si elle est "opérationnelle" (peut agir) ou simplement
-- "consultative" (peut seulement consulter). La séparation des tâches déjà en place
-- (créer une commande / la valider, créer un achat / le réceptionner, déclarer une
-- perte / l'approuver) doit rester imposée par le système, pas laissée au jugement de
-- l'admin.
--
-- `users.role_id` devient un champ optionnel purement informatif (intitulé de poste
-- affiché, aucun effet sur les droits) -- toute la logique d'autorisation bascule sur
-- les deux tables ci-dessous. Les policies de LECTURE qui accordaient déjà une vue
-- cross-société à 'admin' (products_select, orders_select, logs_select, etc. -- motif
-- historique de la Phase 3, pas une "opération" au sens de cette demande) restent
-- inchangées : elles continuent de fonctionner à l'identique puisque le role_id des
-- comptes existants n'est pas effacé, seulement rendu optionnel pour les nouveaux
-- profils -- limite assumée et documentée dans le README (un nouveau profil greffé sur
-- l'attribution utilisateurs.gerer sans jamais avoir eu de rôle 'admin' n'hérite pas de
-- cette vue cross-société ; hors périmètre de cette demande, qui porte sur les
-- opérations métier, pas sur la supervision cross-société).

-- ============================================================================
-- 1. Catalogue des attributions (module métier + action précise), et assignations.
-- ============================================================================

create table public.attributions (
  id uuid primary key default gen_random_uuid(),
  module text not null,
  action_key text not null unique,
  label text not null
);

insert into public.attributions (module, action_key, label) values
  ('produits', 'produits.gerer_catalogue', 'Créer/modifier un produit'),
  ('produits', 'produits.modifier_prix', 'Modifier le prix d''un produit'),
  ('entrepots', 'entrepots.gerer', 'Créer/modifier un entrepôt'),
  ('fournisseurs', 'fournisseurs.gerer', 'Créer/modifier un fournisseur'),
  ('clients', 'clients.gerer', 'Créer/modifier un client'),
  ('achats', 'achats.creer', 'Créer un achat'),
  ('achats', 'achats.annuler', 'Annuler un achat'),
  ('achats', 'achats.receptionner', 'Réceptionner un achat'),
  ('ventes', 'ventes.creer_commande', 'Créer une commande'),
  ('ventes', 'ventes.valider_commande', 'Valider une commande'),
  ('ventes', 'ventes.annuler_commande', 'Annuler une commande'),
  ('ventes', 'ventes.encaisser_paiement', 'Encaisser un paiement'),
  ('stock', 'stock.mouvement_manuel', 'Enregistrer un mouvement de stock'),
  ('stock', 'stock.transfert', 'Transférer entre magasins'),
  ('pertes_stock', 'pertes_stock.declarer', 'Déclarer une perte de stock'),
  ('pertes_stock', 'pertes_stock.approuver', 'Approuver/rejeter une perte de stock'),
  ('transporteurs', 'transporteurs.gerer', 'Créer/modifier un transporteur'),
  ('production', 'production.creer', 'Enregistrer une production'),
  ('transformation', 'transformation.creer', 'Enregistrer une transformation'),
  ('comptabilite', 'comptabilite.gerer_plan_comptable', 'Créer/modifier un compte du plan comptable'),
  ('comptabilite', 'comptabilite.modifier_capital_social', 'Modifier le capital social'),
  ('journal_audit', 'journal_audit.consulter', 'Consulter le journal d''audit'),
  ('journal_comptable', 'journal_comptable.consulter', 'Consulter le journal comptable'),
  ('etats_financiers', 'etats_financiers.consulter', 'Consulter les états financiers / TVA'),
  ('utilisateurs', 'utilisateurs.gerer', 'Créer un profil / réinitialiser un mot de passe');

alter table public.attributions enable row level security;

-- Catalogue non sensible, lecture ouverte à tout authentifié (nécessaire pour afficher
-- l'écran d'assignation) ; pas de policy d'écriture, le catalogue est fixe (géré par
-- migration).
create policy attributions_select on public.attributions
  for select to authenticated
  using (true);

create table public.user_attributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  attribution_id uuid not null references public.attributions (id) on delete cascade,
  level text not null check (level in ('operationnelle', 'consultative')),
  granted_by uuid references public.users (id),
  created_at timestamptz not null default now(),
  unique (user_id, attribution_id)
);

create index user_attributions_user_id_idx on public.user_attributions (user_id);

alter table public.user_attributions enable row level security;

-- Lecture : chacun voit ses propres attributions ; qui gère les utilisateurs
-- (utilisateurs.gerer) voit celles de toute sa société -- nécessaire pour l'écran
-- d'assignation. Aucune policy d'écriture directe : uniquement via set_user_attributions
-- ci-dessous (même patron que le reste de l'app : les changements sensibles passent par
-- une RPC SECURITY DEFINER, jamais par un insert/update RLS ouvert).
create policy user_attributions_select on public.user_attributions
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.users u
      where u.id = user_attributions.user_id
        and u.company_id = public.current_company_id()
    )
  );

-- Paires en conflit : un même profil ne peut pas cumuler les deux attributions d'une
-- paire au niveau "operationnelle" -- même séparation des tâches déjà en vigueur
-- aujourd'hui via des rôles distincts (créer/valider une commande, créer/réceptionner un
-- achat, déclarer/approuver une perte de stock).
create table public.attribution_conflicts (
  attribution_a uuid not null references public.attributions (id),
  attribution_b uuid not null references public.attributions (id),
  check (attribution_a <> attribution_b)
);

insert into public.attribution_conflicts (attribution_a, attribution_b)
select a.id, b.id from public.attributions a, public.attributions b
where (a.action_key, b.action_key) in (
  ('ventes.creer_commande', 'ventes.valider_commande'),
  ('achats.creer', 'achats.receptionner'),
  ('pertes_stock.declarer', 'pertes_stock.approuver')
);

create or replace function public.fn_check_attribution_conflict()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conflict_id uuid;
begin
  if new.level <> 'operationnelle' then
    return new;
  end if;

  select coalesce(c.attribution_a, c.attribution_b) into v_conflict_id
  from public.attribution_conflicts c
  where new.attribution_id in (c.attribution_a, c.attribution_b)
    and (case when c.attribution_a = new.attribution_id then c.attribution_b else c.attribution_a end)
        in (
          select ua.attribution_id from public.user_attributions ua
          where ua.user_id = new.user_id and ua.level = 'operationnelle' and ua.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
        )
  limit 1;

  if v_conflict_id is not null then
    raise exception 'Séparation des tâches : ces deux attributions ne peuvent pas être opérationnelles pour le même profil';
  end if;

  return new;
end;
$$;

create trigger trg_check_attribution_conflict
  before insert or update on public.user_attributions
  for each row execute function public.fn_check_attribution_conflict();

-- ============================================================================
-- 2. Fonctions d'autorisation -- remplacent current_role_name() dans les RPC/policies
--    d'écriture.
-- ============================================================================

create or replace function public.has_attribution(p_action_key text, p_min_level text default 'operationnelle')
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.user_attributions ua
    join public.attributions a on a.id = ua.attribution_id
    where ua.user_id = auth.uid()
      and a.action_key = p_action_key
      and (ua.level = 'operationnelle' or (p_min_level = 'consultative' and ua.level = 'consultative'))
  );
$$;

create or replace function public.has_module_access(p_module text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.user_attributions ua
    join public.attributions a on a.id = ua.attribution_id
    where ua.user_id = auth.uid()
      and a.module = p_module
  );
$$;

grant execute on function public.has_attribution(text, text) to authenticated;
grant execute on function public.has_module_access(text) to authenticated;

-- ============================================================================
-- 3. RPC de gestion des attributions -- réservée à qui gère les utilisateurs.
--    Remplace intégralement l'ensemble des lignes du profil ciblé (delete + upsert dans
--    la même transaction) ; le trigger de conflit s'applique à chaque insert.
-- ============================================================================

create or replace function public.set_user_attributions(p_user_id uuid, p_attributions jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_company uuid := public.current_company_id();
  v_target_company uuid;
  v_item jsonb;
begin
  if not public.has_attribution('utilisateurs.gerer') then
    raise exception 'Non autorisé à gérer les attributions des profils';
  end if;

  select company_id into v_target_company from public.users where id = p_user_id;

  if v_target_company is null or v_target_company is distinct from v_caller_company then
    raise exception 'Profil introuvable pour cette société';
  end if;

  delete from public.user_attributions where user_id = p_user_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_attributions, '[]'::jsonb))
  loop
    insert into public.user_attributions (user_id, attribution_id, level, granted_by)
    select p_user_id, a.id, v_item ->> 'level', auth.uid()
    from public.attributions a
    where a.action_key = v_item ->> 'action_key';
  end loop;
end;
$$;

grant execute on function public.set_user_attributions(uuid, jsonb) to authenticated;

-- ============================================================================
-- 4. Le rôle devient un intitulé de poste optionnel, sans effet sur les droits.
-- ============================================================================

alter table public.users alter column role_id drop not null;

-- ============================================================================
-- 5. Policies RLS d'écriture -- remplacent le rôle unique/la liste de rôles par
--    l'attribution correspondante. Logique de scoping société inchangée.
-- ============================================================================

drop policy products_insert on public.products;
create policy products_insert on public.products
  for insert to authenticated
  with check (
    public.has_attribution('produits.gerer_catalogue')
    and company_id = public.current_company_id()
  );

drop policy products_update on public.products;
create policy products_update on public.products
  for update to authenticated
  using (
    public.has_attribution('produits.gerer_catalogue')
    and company_id = public.current_company_id()
  )
  with check (
    public.has_attribution('produits.gerer_catalogue')
    and company_id = public.current_company_id()
  );

drop policy warehouses_insert on public.warehouses;
create policy warehouses_insert on public.warehouses
  for insert to authenticated
  with check (
    public.has_attribution('entrepots.gerer')
    and company_id = public.current_company_id()
  );

drop policy warehouses_update on public.warehouses;
create policy warehouses_update on public.warehouses
  for update to authenticated
  using (
    public.has_attribution('entrepots.gerer')
    and company_id = public.current_company_id()
  )
  with check (
    public.has_attribution('entrepots.gerer')
    and company_id = public.current_company_id()
  );

drop policy suppliers_insert on public.suppliers;
create policy suppliers_insert on public.suppliers
  for insert to authenticated
  with check (
    public.has_attribution('fournisseurs.gerer')
    and company_id = public.current_company_id()
  );

drop policy suppliers_update on public.suppliers;
create policy suppliers_update on public.suppliers
  for update to authenticated
  using (
    public.has_attribution('fournisseurs.gerer')
    and company_id = public.current_company_id()
  )
  with check (
    public.has_attribution('fournisseurs.gerer')
    and company_id = public.current_company_id()
  );

drop policy clients_insert on public.clients;
create policy clients_insert on public.clients
  for insert to authenticated
  with check (
    public.has_attribution('clients.gerer')
    and company_id = public.current_company_id()
  );

drop policy clients_update on public.clients;
create policy clients_update on public.clients
  for update to authenticated
  using (
    public.has_attribution('clients.gerer')
    and company_id = public.current_company_id()
  )
  with check (
    public.has_attribution('clients.gerer')
    and company_id = public.current_company_id()
  );

drop policy chart_of_accounts_insert on public.chart_of_accounts;
create policy chart_of_accounts_insert on public.chart_of_accounts
  for insert to authenticated
  with check (
    public.has_attribution('comptabilite.gerer_plan_comptable')
    and company_id = public.current_company_id()
  );

drop policy chart_of_accounts_update on public.chart_of_accounts;
create policy chart_of_accounts_update on public.chart_of_accounts
  for update to authenticated
  using (
    public.has_attribution('comptabilite.gerer_plan_comptable')
    and company_id = public.current_company_id()
  )
  with check (
    public.has_attribution('comptabilite.gerer_plan_comptable')
    and company_id = public.current_company_id()
  );

drop policy transactions_insert on public.transactions;
create policy transactions_insert on public.transactions
  for insert to authenticated
  with check (
    public.has_attribution('stock.mouvement_manuel')
    and exists (
      select 1
      from public.products p
      where p.id = transactions.product_id and p.company_id = public.current_company_id()
    )
  );

drop policy transporters_insert on public.transporters;
create policy transporters_insert on public.transporters
  for insert to authenticated
  with check (
    public.has_attribution('transporteurs.gerer')
    and company_id = public.current_company_id()
  );

drop policy transporters_update on public.transporters;
create policy transporters_update on public.transporters
  for update to authenticated
  using (
    public.has_attribution('transporteurs.gerer')
    and company_id = public.current_company_id()
  )
  with check (
    public.has_attribution('transporteurs.gerer')
    and company_id = public.current_company_id()
  );

drop policy companies_accounting_update on public.companies;
create policy companies_accounting_update on public.companies
  for update to authenticated
  using (public.has_attribution('comptabilite.modifier_capital_social') and id = public.current_company_id())
  with check (public.has_attribution('comptabilite.modifier_capital_social') and id = public.current_company_id());

-- logs_select / journal_entries_select / journal_entry_lines_select : la partie
-- "cross-société pour admin" (motif historique Phase 3, hors périmètre de cette
-- attribution des opérations) reste inchangée ; seule la partie "rôle spécialiste, sa
-- société" bascule sur l'attribution correspondante.
drop policy logs_select on public.logs;
create policy logs_select on public.logs
  for select to authenticated
  using (
    public.current_role_name() = 'admin'
    or (
      public.has_attribution('journal_audit.consulter', 'consultative')
      and exists (
        select 1 from public.users u
        where u.id = logs.user_id and u.company_id = public.current_company_id()
      )
    )
  );

drop policy journal_entries_select on public.journal_entries;
create policy journal_entries_select on public.journal_entries
  for select to authenticated
  using (
    public.current_role_name() = 'admin'
    or (
      public.has_attribution('journal_comptable.consulter', 'consultative')
      and company_id = public.current_company_id()
    )
  );

drop policy journal_entry_lines_select on public.journal_entry_lines;
create policy journal_entry_lines_select on public.journal_entry_lines
  for select to authenticated
  using (
    exists (
      select 1
      from public.journal_entries e
      where e.id = journal_entry_lines.entry_id
        and (
          public.current_role_name() = 'admin'
          or (
            public.has_attribution('journal_comptable.consulter', 'consultative')
            and e.company_id = public.current_company_id()
          )
        )
    )
  );

-- ============================================================================
-- 6. RPC métier -- remplace chaque test de rôle par l'attribution correspondante.
--    Logique métier interne reprise à l'identique des dernières définitions en
--    production (0021/0025/0028/0031, texte relu ligne à ligne).
-- ============================================================================

create or replace function public.create_order(payload jsonb)
returns orders
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_caller_company uuid := public.current_company_id();
  v_warehouse_id uuid := (payload ->> 'warehouse_id')::uuid;
  v_client_id uuid := (payload ->> 'client_id')::uuid;
  v_order public.orders;
  v_item jsonb;
  v_product public.products;
begin
  if not public.has_attribution('ventes.creer_commande') then
    raise exception 'Non autorisé à créer une commande';
  end if;

  if v_caller_company is null then
    raise exception 'Aucune société associée à cet utilisateur';
  end if;

  if not exists (
    select 1 from public.warehouses w where w.id = v_warehouse_id and w.company_id = v_caller_company
  ) then
    raise exception 'Magasin introuvable pour cette société';
  end if;

  if not exists (
    select 1 from public.clients c where c.id = v_client_id and c.company_id = v_caller_company
  ) then
    raise exception 'Client introuvable pour cette société';
  end if;

  insert into public.orders (company_id, user_id, status, client_id, warehouse_id)
  values (v_caller_company, auth.uid(), 'pending', v_client_id, v_warehouse_id)
  returning * into v_order;

  for v_item in select * from jsonb_array_elements(payload -> 'items')
  loop
    select * into v_product from public.products where id = (v_item ->> 'product_id')::uuid;

    if v_product is null or v_product.company_id <> v_caller_company then
      raise exception 'Produit % introuvable pour cette société', v_item ->> 'product_id';
    end if;

    insert into public.order_items (order_id, product_id, quantity, unit_price)
    values (v_order.id, v_product.id, (v_item ->> 'quantity')::numeric, v_product.price);
  end loop;

  return v_order;
end;
$$;

create or replace function public.validate_order(order_id uuid)
returns orders
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_caller_company uuid := public.current_company_id();
  v_order public.orders;
  v_item record;
  v_product public.products;
  v_total numeric(14, 2) := 0;
  v_taxable_total numeric(14, 2) := 0;
  v_vat_rate numeric(5, 2);
  v_vat numeric(14, 2);
  v_account_411 uuid;
  v_account_701 uuid;
  v_account_4431 uuid;
  v_entry_id uuid;
begin
  if not public.has_attribution('ventes.valider_commande') then
    raise exception 'Non autorisé à valider une commande';
  end if;

  select * into v_order from public.orders o where o.id = validate_order.order_id;

  if v_order is null then
    raise exception 'Commande introuvable';
  end if;

  if v_order.company_id is distinct from v_caller_company then
    raise exception 'Impossible de valider une commande d''une autre société';
  end if;

  if v_order.status <> 'pending' then
    raise exception 'Seule une commande en attente peut être validée (statut actuel : %)', v_order.status;
  end if;

  for v_item in select * from public.order_items where order_items.order_id = v_order.id
  loop
    insert into public.transactions (product_id, type, quantity, user_id, warehouse_id, order_id)
    values (v_item.product_id, 'OUT', v_item.quantity, auth.uid(), v_order.warehouse_id, v_order.id);

    select * into v_product from public.products where id = v_item.product_id;

    v_total := v_total + (v_item.quantity * v_item.unit_price);
    if v_product.vat_exempt is not true then
      v_taxable_total := v_taxable_total + (v_item.quantity * v_item.unit_price);
    end if;
  end loop;

  update public.orders set status = 'validated' where id = v_order.id
  returning * into v_order;

  if v_total > 0 then
    select vat_rate into v_vat_rate from public.companies where id = v_order.company_id;
    v_vat := round(v_taxable_total * v_vat_rate / 100, 2);

    select id into v_account_411 from public.chart_of_accounts where company_id = v_order.company_id and code = '411';
    select id into v_account_701 from public.chart_of_accounts where company_id = v_order.company_id and code = '701';
    select id into v_account_4431 from public.chart_of_accounts where company_id = v_order.company_id and code = '4431';

    if v_account_411 is null or v_account_701 is null or v_account_4431 is null then
      raise exception 'Plan comptable incomplet pour cette société (comptes 411/701/4431 requis)';
    end if;

    insert into public.journal_entries (company_id, journal_code, description, order_id)
    values (v_order.company_id, 'VENTES', 'Vente #' || left(v_order.id::text, 8), v_order.id)
    returning id into v_entry_id;

    insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
    values (v_entry_id, v_account_411, v_total + v_vat, 0);

    insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
    values (v_entry_id, v_account_701, 0, v_total);

    insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
    values (v_entry_id, v_account_4431, 0, v_vat);
  end if;

  return v_order;
end;
$$;

create or replace function public.cancel_order(order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_company uuid := public.current_company_id();
  v_order public.orders;
begin
  if not public.has_attribution('ventes.annuler_commande') then
    raise exception 'Non autorisé à annuler une commande';
  end if;

  select * into v_order from public.orders o where o.id = cancel_order.order_id;

  if v_order is null then
    raise exception 'Commande introuvable';
  end if;

  if v_order.company_id is distinct from v_caller_company then
    raise exception 'Impossible d''annuler une commande d''une autre société';
  end if;

  if v_order.status <> 'pending' then
    raise exception 'Seule une commande en attente peut être annulée (statut actuel : %)', v_order.status;
  end if;

  update public.orders set status = 'cancelled' where id = v_order.id
  returning * into v_order;

  return v_order;
end;
$$;

create or replace function public.record_payment(order_id uuid, amount numeric)
returns public.orders
language plpgsql
security definer
set search_path = 'public'
as $$
declare
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
  if not public.has_attribution('ventes.encaisser_paiement') then
    raise exception 'Non autorisé à enregistrer un paiement';
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

  insert into public.purchases (company_id, supplier_id, warehouse_id, user_id, status)
  values (v_caller_company, v_supplier_id, v_warehouse_id, auth.uid(), 'pending')
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
      coalesce((v_item ->> 'unit_cost')::numeric, v_product.price)
    );
  end loop;

  return v_purchase;
end;
$$;

create or replace function public.receive_purchase(purchase_id uuid, losses jsonb default '[]'::jsonb)
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
  v_total numeric(14, 2) := 0;
  v_taxable_total numeric(14, 2) := 0;
  v_vat_rate numeric(5, 2);
  v_vat numeric(14, 2);
  v_account_601 uuid;
  v_account_401 uuid;
  v_account_4452 uuid;
  v_entry_id uuid;
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

    if v_quantity_received > 0 then
      insert into public.transactions (product_id, type, quantity, user_id, warehouse_id, purchase_id)
      values (v_item.product_id, 'IN', v_quantity_received, auth.uid(), v_purchase.warehouse_id, v_purchase.id);
    end if;

    if v_quantity_lost > 0 then
      if (v_loss ->> 'transporter_id') is null then
        raise exception 'Un transporteur est requis pour déclarer une perte';
      end if;

      insert into public.purchase_losses (purchase_id, transporter_id, product_id, quantity_lost, unit_cost, reason, user_id)
      values (
        v_purchase.id,
        (v_loss ->> 'transporter_id')::uuid,
        v_item.product_id,
        v_quantity_lost,
        v_item.unit_cost,
        v_loss ->> 'reason',
        auth.uid()
      );
    end if;

    select * into v_product from public.products where id = v_item.product_id;

    v_total := v_total + (v_item.quantity * v_item.unit_cost);
    if v_product.vat_exempt is not true then
      v_taxable_total := v_taxable_total + (v_item.quantity * v_item.unit_cost);
    end if;
  end loop;

  update public.purchases set status = 'received' where id = v_purchase.id
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
    values (v_entry_id, v_account_601, v_total, 0);

    insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
    values (v_entry_id, v_account_4452, v_vat, 0);

    insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
    values (v_entry_id, v_account_401, 0, v_total + v_vat);
  end if;

  return v_purchase;
end;
$$;

create or replace function public.cancel_purchase(purchase_id uuid)
returns public.purchases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_company uuid := public.current_company_id();
  v_purchase public.purchases;
begin
  if not public.has_attribution('achats.annuler') then
    raise exception 'Non autorisé à annuler un achat';
  end if;

  select * into v_purchase from public.purchases p where p.id = cancel_purchase.purchase_id;

  if v_purchase is null then
    raise exception 'Achat introuvable';
  end if;

  if v_purchase.company_id is distinct from v_caller_company then
    raise exception 'Impossible d''annuler un achat d''une autre société';
  end if;

  if v_purchase.status <> 'pending' then
    raise exception 'Seul un achat en attente peut être annulé (statut actuel : %)', v_purchase.status;
  end if;

  update public.purchases set status = 'cancelled' where id = v_purchase.id
  returning * into v_purchase;

  return v_purchase;
end;
$$;

create or replace function public.create_production(payload jsonb)
returns productions
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_caller_company uuid := public.current_company_id();
  v_warehouse_id uuid := (payload ->> 'warehouse_id')::uuid;
  v_production public.productions;
  v_item jsonb;
  v_product public.products;
  v_quantity numeric(12, 3);
  v_unit_cost numeric(12, 2);
begin
  if not public.has_attribution('production.creer') then
    raise exception 'Non autorisé à créer une production';
  end if;

  if v_caller_company is null then
    raise exception 'Aucune société associée à cet utilisateur';
  end if;

  if not exists (
    select 1 from public.warehouses w where w.id = v_warehouse_id and w.company_id = v_caller_company
  ) then
    raise exception 'Magasin introuvable pour cette société';
  end if;

  if jsonb_array_length(coalesce(payload -> 'items', '[]'::jsonb)) = 0 then
    raise exception 'Une production doit comporter au moins une ligne';
  end if;

  insert into public.productions (company_id, warehouse_id, user_id)
  values (v_caller_company, v_warehouse_id, auth.uid())
  returning * into v_production;

  for v_item in select * from jsonb_array_elements(payload -> 'items')
  loop
    select * into v_product from public.products where id = (v_item ->> 'product_id')::uuid;

    if v_product is null or v_product.company_id <> v_caller_company then
      raise exception 'Produit % introuvable pour cette société', v_item ->> 'product_id';
    end if;

    v_quantity := (v_item ->> 'quantity')::numeric;
    v_unit_cost := coalesce((v_item ->> 'unit_cost')::numeric, v_product.price);

    insert into public.production_items (production_id, product_id, quantity, unit_cost)
    values (v_production.id, v_product.id, v_quantity, v_unit_cost);

    insert into public.transactions (product_id, type, quantity, user_id, warehouse_id, production_id)
    values (v_product.id, 'IN', v_quantity, auth.uid(), v_warehouse_id, v_production.id);
  end loop;

  return v_production;
end;
$$;

create or replace function public.create_transformation(payload jsonb)
returns transformations
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_caller_company uuid := public.current_company_id();
  v_warehouse_id uuid := (payload ->> 'warehouse_id')::uuid;
  v_transformation public.transformations;
  v_item jsonb;
  v_product public.products;
  v_quantity numeric(12, 3);
  v_unit_cost numeric(12, 2);
  v_input_ids uuid[] := '{}';
  v_output_ids uuid[] := '{}';
begin
  if not public.has_attribution('transformation.creer') then
    raise exception 'Non autorisé à créer une transformation';
  end if;

  if v_caller_company is null then
    raise exception 'Aucune société associée à cet utilisateur';
  end if;

  if not exists (
    select 1 from public.warehouses w where w.id = v_warehouse_id and w.company_id = v_caller_company
  ) then
    raise exception 'Magasin introuvable pour cette société';
  end if;

  if jsonb_array_length(coalesce(payload -> 'inputs', '[]'::jsonb)) = 0 then
    raise exception 'Une transformation doit comporter au moins un intrant';
  end if;

  if jsonb_array_length(coalesce(payload -> 'outputs', '[]'::jsonb)) = 0 then
    raise exception 'Une transformation doit comporter au moins un extrant';
  end if;

  select array_agg((elem ->> 'product_id')::uuid) into v_input_ids
  from jsonb_array_elements(payload -> 'inputs') as elem;

  select array_agg((elem ->> 'product_id')::uuid) into v_output_ids
  from jsonb_array_elements(payload -> 'outputs') as elem;

  if v_input_ids && v_output_ids then
    raise exception 'Un même produit ne peut pas être à la fois intrant et extrant d''une transformation';
  end if;

  insert into public.transformations (company_id, warehouse_id, user_id)
  values (v_caller_company, v_warehouse_id, auth.uid())
  returning * into v_transformation;

  for v_item in select * from jsonb_array_elements(payload -> 'inputs')
  loop
    select * into v_product from public.products where id = (v_item ->> 'product_id')::uuid;

    if v_product is null or v_product.company_id <> v_caller_company then
      raise exception 'Produit % introuvable pour cette société', v_item ->> 'product_id';
    end if;

    v_quantity := (v_item ->> 'quantity')::numeric;

    insert into public.transformation_inputs (transformation_id, product_id, quantity)
    values (v_transformation.id, v_product.id, v_quantity);

    insert into public.transactions (product_id, type, quantity, user_id, warehouse_id, transformation_id)
    values (v_product.id, 'OUT', v_quantity, auth.uid(), v_warehouse_id, v_transformation.id);
  end loop;

  for v_item in select * from jsonb_array_elements(payload -> 'outputs')
  loop
    select * into v_product from public.products where id = (v_item ->> 'product_id')::uuid;

    if v_product is null or v_product.company_id <> v_caller_company then
      raise exception 'Produit % introuvable pour cette société', v_item ->> 'product_id';
    end if;

    v_quantity := (v_item ->> 'quantity')::numeric;
    v_unit_cost := coalesce((v_item ->> 'unit_cost')::numeric, v_product.price);

    insert into public.transformation_outputs (transformation_id, product_id, quantity, unit_cost)
    values (v_transformation.id, v_product.id, v_quantity, v_unit_cost);

    insert into public.transactions (product_id, type, quantity, user_id, warehouse_id, transformation_id)
    values (v_product.id, 'IN', v_quantity, auth.uid(), v_warehouse_id, v_transformation.id);
  end loop;

  return v_transformation;
end;
$$;

create or replace function public.transfer_stock(
  p_product_id uuid,
  p_from_warehouse_id uuid,
  p_to_warehouse_id uuid,
  p_quantity numeric
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_caller_company uuid := public.current_company_id();
  v_from_warehouse public.warehouses;
  v_to_warehouse public.warehouses;
  v_transfer_id uuid := gen_random_uuid();
begin
  if not public.has_attribution('stock.transfert') then
    raise exception 'Non autorisé à transférer du stock';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La quantité transférée doit être positive';
  end if;

  if p_from_warehouse_id = p_to_warehouse_id then
    raise exception 'Le magasin source et le magasin destination doivent être différents';
  end if;

  select * into v_from_warehouse from public.warehouses w where w.id = p_from_warehouse_id;
  select * into v_to_warehouse from public.warehouses w where w.id = p_to_warehouse_id;

  if v_from_warehouse is null or v_to_warehouse is null then
    raise exception 'Magasin introuvable';
  end if;

  if v_from_warehouse.company_id is distinct from v_caller_company
    or v_to_warehouse.company_id is distinct from v_caller_company
  then
    raise exception 'Impossible de transférer du stock vers/depuis un magasin d''une autre société';
  end if;

  if not exists (
    select 1 from public.products p
    where p.id = p_product_id and p.company_id = v_caller_company
  ) then
    raise exception 'Produit introuvable';
  end if;

  insert into public.transactions (product_id, type, quantity, user_id, warehouse_id, note, transfer_group_id)
  values (
    p_product_id, 'OUT', p_quantity, auth.uid(), p_from_warehouse_id,
    'Transfert vers ' || v_to_warehouse.name, v_transfer_id
  );

  insert into public.transactions (product_id, type, quantity, user_id, warehouse_id, note, transfer_group_id)
  values (
    p_product_id, 'IN', p_quantity, auth.uid(), p_to_warehouse_id,
    'Transfert depuis ' || v_from_warehouse.name, v_transfer_id
  );
end;
$$;

create or replace function public.update_product_price(
  product_id uuid,
  new_price numeric,
  reason text default null
)
returns public.products
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_caller_company uuid := public.current_company_id();
  v_product public.products;
begin
  if not public.has_attribution('produits.modifier_prix') then
    raise exception 'Non autorisé à modifier le prix d''un produit';
  end if;

  select * into v_product from public.products p where p.id = update_product_price.product_id;

  if v_product is null or v_product.company_id <> v_caller_company then
    raise exception 'Produit introuvable pour cette société';
  end if;

  if new_price is null or new_price < 0 then
    raise exception 'Le nouveau prix doit être positif';
  end if;

  if new_price <> v_product.price then
    insert into public.product_price_history (product_id, old_price, new_price, reason, user_id)
    values (v_product.id, v_product.price, new_price, update_product_price.reason, auth.uid());

    update public.products set price = new_price where id = v_product.id
    returning * into v_product;
  end if;

  return v_product;
end;
$$;

create or replace function public.request_stock_loss(
  p_product_id uuid,
  p_warehouse_id uuid,
  p_quantity numeric,
  p_reason text,
  p_repackaged_quantity numeric default null
)
returns public.stock_loss_requests
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_company uuid := public.current_company_id();
  v_request public.stock_loss_requests;
begin
  if not public.has_attribution('pertes_stock.declarer') then
    raise exception 'Non autorisé à déclarer une perte de stock';
  end if;

  if v_company is null then
    raise exception 'Aucune société associée à cet utilisateur';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La quantité doit être positive';
  end if;

  if p_repackaged_quantity is not null and p_repackaged_quantity >= p_quantity then
    raise exception 'La quantité reconditionnée doit être inférieure à la quantité de départ';
  end if;

  if trim(coalesce(p_reason, '')) = '' then
    raise exception 'Un motif est requis';
  end if;

  if not exists (select 1 from public.products where id = p_product_id and company_id = v_company) then
    raise exception 'Produit introuvable pour cette société';
  end if;

  if not exists (select 1 from public.warehouses where id = p_warehouse_id and company_id = v_company) then
    raise exception 'Magasin introuvable pour cette société';
  end if;

  insert into public.stock_loss_requests (
    company_id, product_id, warehouse_id, quantity, repackaged_quantity, reason, requested_by
  )
  values (v_company, p_product_id, p_warehouse_id, p_quantity, p_repackaged_quantity, p_reason, auth.uid())
  returning * into v_request;

  return v_request;
end;
$$;

create or replace function public.approve_stock_loss(p_request_id uuid)
returns public.stock_loss_requests
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_company uuid := public.current_company_id();
  v_request public.stock_loss_requests;
  v_transaction_id uuid;
  v_transformation public.transformations;
begin
  if not public.has_attribution('pertes_stock.approuver') then
    raise exception 'Non autorisé à approuver une perte de stock';
  end if;

  select * into v_request from public.stock_loss_requests
  where id = p_request_id and company_id = v_company and status = 'pending'
  for update;

  if v_request is null then
    raise exception 'Demande introuvable ou déjà traitée';
  end if;

  if v_request.repackaged_quantity is null then
    insert into public.transactions (product_id, type, quantity, user_id, warehouse_id, note)
    values (v_request.product_id, 'ADJUSTMENT', -v_request.quantity, v_request.requested_by, v_request.warehouse_id, v_request.reason)
    returning id into v_transaction_id;

    update public.stock_loss_requests
    set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), transaction_id = v_transaction_id
    where id = p_request_id
    returning * into v_request;
  else
    insert into public.transformations (company_id, warehouse_id, user_id)
    values (v_company, v_request.warehouse_id, v_request.requested_by)
    returning * into v_transformation;

    insert into public.transformation_inputs (transformation_id, product_id, quantity)
    values (v_transformation.id, v_request.product_id, v_request.quantity);

    insert into public.transactions (product_id, type, quantity, user_id, warehouse_id, transformation_id)
    values (v_request.product_id, 'OUT', v_request.quantity, v_request.requested_by, v_request.warehouse_id, v_transformation.id);

    insert into public.transformation_outputs (transformation_id, product_id, quantity, unit_cost)
    select v_transformation.id, v_request.product_id, v_request.repackaged_quantity, price
    from public.products where id = v_request.product_id;

    insert into public.transactions (product_id, type, quantity, user_id, warehouse_id, transformation_id)
    values (v_request.product_id, 'IN', v_request.repackaged_quantity, v_request.requested_by, v_request.warehouse_id, v_transformation.id);

    update public.stock_loss_requests
    set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), transformation_id = v_transformation.id
    where id = p_request_id
    returning * into v_request;
  end if;

  return v_request;
end;
$$;

create or replace function public.reject_stock_loss(p_request_id uuid, p_rejection_reason text)
returns public.stock_loss_requests
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_company uuid := public.current_company_id();
  v_request public.stock_loss_requests;
begin
  if not public.has_attribution('pertes_stock.approuver') then
    raise exception 'Non autorisé à rejeter une perte de stock';
  end if;

  update public.stock_loss_requests
  set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason = p_rejection_reason
  where id = p_request_id and company_id = v_company and status = 'pending'
  returning * into v_request;

  if v_request is null then
    raise exception 'Demande introuvable ou déjà traitée';
  end if;

  return v_request;
end;
$$;

-- ============================================================================
-- 7. Backfill : chaque compte existant reçoit l'équivalent exact de ce que son rôle
--    actuel lui permet déjà -- la nouvelle flexibilité ne devient exploitable qu'après
--    coup, quand l'admin modifie une fiche via set_user_attributions.
-- ============================================================================

do $$
declare
  v_user record;
  v_role text;
begin
  for v_user in select u.id, r.name as role_name from public.users u
    join public.roles r on r.id = u.role_id
  loop
    v_role := v_user.role_name;

    if v_role = 'admin' then
      insert into public.user_attributions (user_id, attribution_id, level)
      select v_user.id, id, 'consultative' from public.attributions
      where module in (
        'produits', 'entrepots', 'fournisseurs', 'clients', 'achats', 'ventes', 'stock',
        'pertes_stock', 'transporteurs', 'production', 'transformation', 'comptabilite',
        'journal_audit', 'journal_comptable', 'etats_financiers'
      );
      insert into public.user_attributions (user_id, attribution_id, level)
      select v_user.id, id, 'operationnelle' from public.attributions where action_key = 'utilisateurs.gerer';

    elsif v_role = 'controller' then
      insert into public.user_attributions (user_id, attribution_id, level)
      select v_user.id, id, 'consultative' from public.attributions
      where module in (
        'produits', 'entrepots', 'fournisseurs', 'clients', 'achats', 'ventes', 'stock',
        'pertes_stock', 'transporteurs', 'production', 'transformation', 'comptabilite',
        'journal_audit', 'journal_comptable', 'etats_financiers'
      );
      insert into public.user_attributions (user_id, attribution_id, level)
      select v_user.id, id, 'operationnelle' from public.attributions where action_key = 'pertes_stock.approuver'
      on conflict (user_id, attribution_id) do update set level = 'operationnelle';

    elsif v_role = 'warehouse_manager' then
      insert into public.user_attributions (user_id, attribution_id, level)
      select v_user.id, id, 'operationnelle' from public.attributions
      where action_key in (
        'entrepots.gerer', 'achats.receptionner', 'stock.mouvement_manuel', 'stock.transfert',
        'pertes_stock.declarer', 'produits.gerer_catalogue', 'produits.modifier_prix', 'transporteurs.gerer'
      );

    elsif v_role = 'supervisor' then
      insert into public.user_attributions (user_id, attribution_id, level)
      select v_user.id, id, 'operationnelle' from public.attributions where action_key = 'ventes.valider_commande';
      insert into public.user_attributions (user_id, attribution_id, level)
      select v_user.id, id, 'consultative' from public.attributions where module = 'ventes'
      on conflict (user_id, attribution_id) do nothing;

    elsif v_role = 'sales_operator' then
      insert into public.user_attributions (user_id, attribution_id, level)
      select v_user.id, id, 'operationnelle' from public.attributions
      where action_key in ('ventes.creer_commande', 'ventes.annuler_commande', 'clients.gerer');

    elsif v_role = 'purchasing' then
      insert into public.user_attributions (user_id, attribution_id, level)
      select v_user.id, id, 'operationnelle' from public.attributions
      where action_key in ('achats.creer', 'achats.annuler', 'fournisseurs.gerer');

    elsif v_role = 'accounting' then
      insert into public.user_attributions (user_id, attribution_id, level)
      select v_user.id, id, 'operationnelle' from public.attributions
      where action_key in ('ventes.encaisser_paiement', 'comptabilite.gerer_plan_comptable', 'comptabilite.modifier_capital_social');
      insert into public.user_attributions (user_id, attribution_id, level)
      select v_user.id, id, 'consultative' from public.attributions
      where action_key in ('journal_comptable.consulter', 'etats_financiers.consulter');

    elsif v_role = 'production_manager' then
      insert into public.user_attributions (user_id, attribution_id, level)
      select v_user.id, id, 'operationnelle' from public.attributions
      where action_key in (
        'production.creer', 'transformation.creer', 'produits.gerer_catalogue',
        'produits.modifier_prix', 'pertes_stock.declarer'
      );

    elsif v_role = 'logistics_transport' then
      insert into public.user_attributions (user_id, attribution_id, level)
      select v_user.id, id, 'operationnelle' from public.attributions
      where action_key in ('stock.mouvement_manuel', 'stock.transfert', 'transporteurs.gerer', 'pertes_stock.declarer');
    end if;
  end loop;
end;
$$;
