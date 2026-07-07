-- Fonctions et triggers serveur : RBAC, provisioning de profil, mise à jour automatique
-- du stock, journalisation d'audit inviolable, création transactionnelle de commande.
--
-- Toutes les fonctions SECURITY DEFINER sont créées par le rôle propriétaire de la
-- migration (postgres), qui contourne la RLS — c'est ce qui permet à current_role_name()
-- de lire public.users sans provoquer de récursion RLS, et à fn_audit_log() d'écrire
-- dans logs alors que les policies interdisent tout insert direct par "authenticated".

-- Rôle de l'utilisateur courant (utilisé par toutes les policies RLS)
create or replace function public.current_role_name()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select r.name
  from public.users u
  join public.roles r on r.id = u.role_id
  where u.id = auth.uid()
$$;

-- Société de l'utilisateur courant (scoping multi-société)
create or replace function public.current_company_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select company_id from public.users where id = auth.uid()
$$;

-- Création automatique du profil public.users à l'inscription Supabase Auth.
-- Rôle par défaut : "seller" (le moins privilégié en écriture) ; un admin doit ensuite
-- assigner le rôle définitif et la société via l'écran Utilisateurs (ou l'Edge Function
-- create-user, qui fait les deux en une seule opération).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_default_role_id smallint;
begin
  select id into v_default_role_id from public.roles where name = 'seller';

  insert into public.users (id, email, role_id)
  values (new.id, new.email, v_default_role_id);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Mise à jour automatique du stock produit à partir des transactions.
-- Remplace le "UPDATE products SET stock = stock - 1" manuel du cahier des charges :
-- ici c'est atomique, ne peut pas être oublié par le code client, et s'applique même à
-- des écritures faites directement en SQL. Le CHECK (stock >= 0) sur products fait
-- échouer (et annule) toute transaction qui mettrait le stock en négatif.
create or replace function public.fn_apply_transaction_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delta integer;
begin
  v_delta := case new.type
    when 'IN' then new.quantity
    when 'OUT' then -new.quantity
    when 'ADJUSTMENT' then new.quantity
  end;

  update public.products
  set stock = stock + v_delta
  where id = new.product_id;

  return new;
end;
$$;

create trigger trg_transactions_apply_stock
  after insert on public.transactions
  for each row execute function public.fn_apply_transaction_stock();

-- Immutabilité du grand livre : aucune UPDATE/DELETE sur transactions ou logs, pour
-- quiconque (y compris en cas de policy RLS mal configurée demain) — une correction se
-- fait par une nouvelle transaction ADJUSTMENT, jamais en réécrivant l'historique.
create or replace function public.fn_block_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Modification interdite : % est un journal en append-only', tg_table_name;
end;
$$;

create trigger trg_transactions_immutable
  before update or delete on public.transactions
  for each row execute function public.fn_block_mutation();

create trigger trg_logs_immutable
  before update or delete on public.logs
  for each row execute function public.fn_block_mutation();

-- Journalisation d'audit générique : remplace l'INSERT INTO logs fait "à la main" par le
-- code applicatif dans le cahier des charges (un client authentifié pourrait sinon
-- falsifier ou tout simplement oublier de journaliser). Ici, aucune action sur les tables
-- métier ne peut échapper au journal, et le client ne peut pas écrire dans logs lui-même
-- (voir les policies RLS de 0003).
create or replace function public.fn_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
begin
  if tg_op = 'DELETE' then
    v_payload := to_jsonb(old);
  else
    v_payload := to_jsonb(new);
  end if;

  insert into public.logs (user_id, action, module, metadata)
  values (auth.uid(), tg_op, tg_table_name, v_payload);

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger trg_audit_products
  after insert or update or delete on public.products
  for each row execute function public.fn_audit_log();

create trigger trg_audit_orders
  after insert or update or delete on public.orders
  for each row execute function public.fn_audit_log();

create trigger trg_audit_order_items
  after insert or update or delete on public.order_items
  for each row execute function public.fn_audit_log();

create trigger trg_audit_transactions
  after insert on public.transactions
  for each row execute function public.fn_audit_log();

-- Création transactionnelle d'une commande : commande + lignes + sorties de stock dans
-- une seule transaction Postgres, au lieu d'enchaîner plusieurs appels REST côté client
-- (ce qui risquerait de laisser une commande à moitié créée en cas d'erreur réseau).
-- payload attendu : {"company_id": "uuid" (optionnel, sinon société de l'appelant),
--                     "items": [{"product_id": "uuid", "quantity": n}, ...]}
create or replace function public.create_order(payload jsonb)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.current_role_name();
  v_caller_company uuid := public.current_company_id();
  v_company_id uuid;
  v_order public.orders;
  v_item jsonb;
  v_product public.products;
begin
  if v_role is null or v_role not in ('admin', 'manager', 'seller') then
    raise exception 'Rôle % non autorisé à créer une commande', coalesce(v_role, '(aucun)');
  end if;

  v_company_id := coalesce((payload ->> 'company_id')::uuid, v_caller_company);

  if v_role <> 'admin' and v_company_id is distinct from v_caller_company then
    raise exception 'Impossible de créer une commande pour une autre société';
  end if;

  if v_company_id is null then
    raise exception 'Aucune société associée à cet utilisateur';
  end if;

  insert into public.orders (company_id, user_id, status)
  values (v_company_id, auth.uid(), 'pending')
  returning * into v_order;

  for v_item in select * from jsonb_array_elements(payload -> 'items')
  loop
    select * into v_product from public.products where id = (v_item ->> 'product_id')::uuid;

    if v_product is null or v_product.company_id <> v_company_id then
      raise exception 'Produit % introuvable pour cette société', v_item ->> 'product_id';
    end if;

    insert into public.order_items (order_id, product_id, quantity, unit_price)
    values (v_order.id, v_product.id, (v_item ->> 'quantity')::integer, v_product.price);

    insert into public.transactions (product_id, type, quantity, user_id, order_id)
    values (v_product.id, 'OUT', (v_item ->> 'quantity')::integer, auth.uid(), v_order.id);
  end loop;

  return v_order;
end;
$$;

grant execute on function public.create_order(jsonb) to authenticated;
