-- Vente : rattache les commandes à un client, ajoute le suivi de paiement, et bascule
-- validation/annulation vers des RPC dédiées (aligné sur le patron achats) au lieu de la
-- policy RLS orders_update_status — l'annulation restaure désormais le stock via une
-- transaction ADJUSTMENT par ligne, ce qui n'était pas possible avec un simple UPDATE
-- direct côté client (limite connue documentée jusqu'ici dans le README).

create type public.payment_status as enum ('unpaid', 'partial', 'paid');

-- Bootstrap : un client "Client comptant" par société existante, pour rattacher les
-- commandes déjà en base avant l'introduction de client_id (même mécanique que le
-- bootstrap "Magasin principal" en 0004).
insert into public.clients (company_id, name)
select id, 'Client comptant' from public.companies;

alter table public.orders add column client_id uuid references public.clients (id);

update public.orders o
set client_id = c.id
from public.clients c
where c.company_id = o.company_id and c.name = 'Client comptant';

alter table public.orders alter column client_id set not null;

create index orders_client_id_idx on public.orders (client_id);

alter table public.orders add column payment_status public.payment_status not null default 'unpaid';
alter table public.orders add column amount_paid numeric(12, 2) not null default 0 check (amount_paid >= 0);

-- Réécriture de create_order (définie en 0002, modifiée en 0004 pour warehouse_id) :
-- ajoute client_id, même garde-fou d'appartenance à la société que warehouse_id.
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
  v_warehouse_id uuid := (payload ->> 'warehouse_id')::uuid;
  v_client_id uuid := (payload ->> 'client_id')::uuid;
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

  if not exists (
    select 1 from public.warehouses w where w.id = v_warehouse_id and w.company_id = v_company_id
  ) then
    raise exception 'Magasin introuvable pour cette société';
  end if;

  if not exists (
    select 1 from public.clients c where c.id = v_client_id and c.company_id = v_company_id
  ) then
    raise exception 'Client introuvable pour cette société';
  end if;

  insert into public.orders (company_id, user_id, status, client_id)
  values (v_company_id, auth.uid(), 'pending', v_client_id)
  returning * into v_order;

  for v_item in select * from jsonb_array_elements(payload -> 'items')
  loop
    select * into v_product from public.products where id = (v_item ->> 'product_id')::uuid;

    if v_product is null or v_product.company_id <> v_company_id then
      raise exception 'Produit % introuvable pour cette société', v_item ->> 'product_id';
    end if;

    insert into public.order_items (order_id, product_id, quantity, unit_price)
    values (v_order.id, v_product.id, (v_item ->> 'quantity')::integer, v_product.price);

    insert into public.transactions (product_id, type, quantity, user_id, warehouse_id, order_id)
    values (v_product.id, 'OUT', (v_item ->> 'quantity')::integer, auth.uid(), v_warehouse_id, v_order.id);
  end loop;

  return v_order;
end;
$$;

-- Validation : simple transition de statut, aucun impact stock.
create or replace function public.validate_order(order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.current_role_name();
  v_caller_company uuid := public.current_company_id();
  v_order public.orders;
begin
  if v_role is null or v_role not in ('admin', 'manager') then
    raise exception 'Rôle % non autorisé à valider une commande', coalesce(v_role, '(aucun)');
  end if;

  select * into v_order from public.orders o where o.id = validate_order.order_id;

  if v_order is null then
    raise exception 'Commande introuvable';
  end if;

  if v_role <> 'admin' and v_order.company_id is distinct from v_caller_company then
    raise exception 'Impossible de valider une commande d''une autre société';
  end if;

  if v_order.status <> 'pending' then
    raise exception 'Seule une commande en attente peut être validée (statut actuel : %)', v_order.status;
  end if;

  update public.orders set status = 'validated' where id = v_order.id
  returning * into v_order;

  return v_order;
end;
$$;

-- Annulation : restaure le stock via une transaction ADJUSTMENT par ligne (même magasin
-- que la commande), puis passe le statut à cancelled. Seules les commandes pending sont
-- annulables (l'UI ne propose déjà l'action que dans ce cas).
create or replace function public.cancel_order(order_id uuid)
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
  v_warehouse_id uuid;
begin
  if v_role is null or v_role not in ('admin', 'manager') then
    raise exception 'Rôle % non autorisé à annuler une commande', coalesce(v_role, '(aucun)');
  end if;

  select * into v_order from public.orders o where o.id = cancel_order.order_id;

  if v_order is null then
    raise exception 'Commande introuvable';
  end if;

  if v_role <> 'admin' and v_order.company_id is distinct from v_caller_company then
    raise exception 'Impossible d''annuler une commande d''une autre société';
  end if;

  if v_order.status <> 'pending' then
    raise exception 'Seule une commande en attente peut être annulée (statut actuel : %)', v_order.status;
  end if;

  select t.warehouse_id into v_warehouse_id
  from public.transactions t
  where t.order_id = v_order.id
  limit 1;

  for v_item in select * from public.order_items where order_items.order_id = v_order.id
  loop
    insert into public.transactions (product_id, type, quantity, user_id, warehouse_id, order_id)
    values (v_item.product_id, 'ADJUSTMENT', v_item.quantity, auth.uid(), v_warehouse_id, v_order.id);
  end loop;

  update public.orders set status = 'cancelled' where id = v_order.id
  returning * into v_order;

  return v_order;
end;
$$;

-- Paiement : pure information de gestion, sans impact sur le grand livre — passe quand
-- même par une RPC pour ne pas ouvrir de policy UPDATE générique sur orders.
create or replace function public.record_payment(order_id uuid, payment_status public.payment_status, amount_paid numeric)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.current_role_name();
  v_caller_company uuid := public.current_company_id();
  v_order public.orders;
begin
  if v_role is null or v_role not in ('admin', 'manager') then
    raise exception 'Rôle % non autorisé à enregistrer un paiement', coalesce(v_role, '(aucun)');
  end if;

  select * into v_order from public.orders o where o.id = record_payment.order_id;

  if v_order is null then
    raise exception 'Commande introuvable';
  end if;

  if v_role <> 'admin' and v_order.company_id is distinct from v_caller_company then
    raise exception 'Impossible d''enregistrer un paiement pour une commande d''une autre société';
  end if;

  update public.orders
  set payment_status = record_payment.payment_status,
      amount_paid = record_payment.amount_paid
  where id = v_order.id
  returning * into v_order;

  return v_order;
end;
$$;

grant execute on function public.validate_order(uuid) to authenticated;
grant execute on function public.cancel_order(uuid) to authenticated;
grant execute on function public.record_payment(uuid, public.payment_status, numeric) to authenticated;

drop policy orders_update_status on public.orders;
