-- Archivage (désactivation) des comptes, magasins, produits, fournisseurs et clients --
-- alternative sûre à la suppression, qui reste structurellement impossible dès qu'un
-- enregistrement a été référencé (voir README, "Limites connues" : logs/transactions/
-- commandes/achats sont append-only par conception, pour la traçabilité). Archiver ne
-- supprime rien : ça masque l'enregistrement des nouvelles sélections (achats, ventes,
-- mouvements...) et, pour un compte utilisateur, bloque toute nouvelle action -- sans
-- jamais toucher à l'historique déjà écrit.

alter table public.users add column active boolean not null default true;
alter table public.warehouses add column active boolean not null default true;
alter table public.products add column active boolean not null default true;
alter table public.suppliers add column active boolean not null default true;
alter table public.clients add column active boolean not null default true;

-- Un compte désactivé perd sa société aux yeux de toutes les policies RLS et fonctions
-- RPC qui s'appuient sur current_company_id() (la quasi-totalité) : elles échouent déjà
-- toutes avec "Aucune société associée à cet utilisateur" quand cette fonction renvoie
-- null, sans qu'il soit nécessaire de modifier une à une des dizaines de policies.
create or replace function public.current_company_id()
returns uuid
language sql
stable security definer
set search_path = public
as $$
  select company_id from public.users where id = auth.uid() and active = true
$$;

create or replace function public.current_role_name()
returns text
language sql
stable security definer
set search_path = public
as $$
  select r.name
  from public.users u
  join public.roles r on r.id = u.role_id
  where u.id = auth.uid() and u.active = true
$$;

-- Défense en profondeur : empêcher la création d'un nouvel achat ou d'une nouvelle
-- commande référençant un fournisseur/magasin/client/produit archivé, même par un appel
-- direct à l'API (au-delà du simple filtrage des listes déroulantes côté interface).
-- Un achat/une commande déjà existant(e) référençant un enregistrement archivé depuis
-- reste réceptionnable/validable normalement : l'archivage n'est jamais rétroactif.
create or replace function public.create_purchase(payload jsonb)
returns purchases
language plpgsql
security definer
set search_path = public
as $function$
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
    select 1 from public.suppliers s
    where s.id = v_supplier_id and s.company_id = v_caller_company and s.active = true
  ) then
    raise exception 'Fournisseur introuvable ou archivé pour cette société';
  end if;

  if not exists (
    select 1 from public.warehouses w
    where w.id = v_warehouse_id and w.company_id = v_caller_company and w.active = true
  ) then
    raise exception 'Magasin introuvable ou archivé pour cette société';
  end if;

  insert into public.purchases (company_id, supplier_id, warehouse_id, user_id, status, freight_cost, handling_cost)
  values (
    v_caller_company, v_supplier_id, v_warehouse_id, auth.uid(), 'pending',
    coalesce((payload ->> 'freight_cost')::numeric, 0),
    coalesce((payload ->> 'handling_cost')::numeric, 0)
  )
  returning * into v_purchase;

  for v_item in select * from jsonb_array_elements(payload -> 'items')
  loop
    select * into v_product from public.products where id = (v_item ->> 'product_id')::uuid;

    if v_product is null or v_product.company_id <> v_caller_company then
      raise exception 'Produit % introuvable pour cette société', v_item ->> 'product_id';
    end if;

    if v_product.active is not true then
      raise exception 'Produit % archivé, indisponible pour un nouvel achat', v_product.name;
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
$function$;

create or replace function public.create_order(payload jsonb)
returns orders
language plpgsql
security definer
set search_path = public
as $function$
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
    select 1 from public.warehouses w
    where w.id = v_warehouse_id and w.company_id = v_caller_company and w.active = true
  ) then
    raise exception 'Magasin introuvable ou archivé pour cette société';
  end if;

  if not exists (
    select 1 from public.clients c
    where c.id = v_client_id and c.company_id = v_caller_company and c.active = true
  ) then
    raise exception 'Client introuvable ou archivé pour cette société';
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

    if v_product.active is not true then
      raise exception 'Produit % archivé, indisponible pour une nouvelle commande', v_product.name;
    end if;

    insert into public.order_items (order_id, product_id, quantity, unit_price)
    values (v_order.id, v_product.id, (v_item ->> 'quantity')::numeric, v_product.price);
  end loop;

  return v_order;
end;
$function$;
