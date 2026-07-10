-- Phase 11 : traçabilité des mouvements de stock (provenance/destination) et transferts
-- entre magasins, en réponse au cahier des charges affiné (Gestionnaire de magasin :
-- "niveau de détail complet — provenance, destination" ; Logistique/Transport :
-- "mouvements de marchandises entre sites").

alter table public.transactions
  add column note text;

alter table public.transactions
  add column transfer_group_id uuid;

create index transactions_transfer_group_id_idx on public.transactions (transfer_group_id);

-- Transfert atomique entre deux magasins de la même société : insère un OUT au magasin
-- source et un IN au magasin destination, liés par transfer_group_id. Même rôle habilité
-- que l'insertion manuelle directe (policy transactions_insert, 0016). Le contrôle de
-- stock insuffisant est délégué à la contrainte existante product_stocks.stock >= 0,
-- déclenchée par le trigger fn_apply_transaction_stock (inchangé) sur l'insert OUT.
create or replace function public.transfer_stock(
  p_product_id uuid,
  p_from_warehouse_id uuid,
  p_to_warehouse_id uuid,
  p_quantity integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.current_role_name();
  v_caller_company uuid := public.current_company_id();
  v_from_warehouse public.warehouses;
  v_to_warehouse public.warehouses;
  v_transfer_id uuid := gen_random_uuid();
begin
  if v_role is null or v_role not in ('warehouse_manager', 'logistics_transport') then
    raise exception 'Rôle % non autorisé à transférer du stock', coalesce(v_role, '(aucun)');
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

grant execute on function public.transfer_stock(uuid, uuid, uuid, integer) to authenticated;
