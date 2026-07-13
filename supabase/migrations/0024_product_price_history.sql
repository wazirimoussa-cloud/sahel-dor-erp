-- Historique des changements de prix produit. Jusqu'ici aucune fonctionnalité ne
-- permettait de modifier le prix d'un produit existant (seule la création en fixait un).
-- L'utilisateur veut que tout rabais/augmentation sur un produit déjà en vente soit
-- tracé (qui, quand, ancien prix, nouveau prix) plutôt qu'une valeur simplement écrasée
-- — même philosophie que le reste de l'app (grand livre append-only, jamais de
-- réécriture silencieuse).

create table public.product_price_history (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id),
  old_price numeric(12, 2) not null,
  new_price numeric(12, 2) not null,
  reason text,
  user_id uuid not null references public.users (id),
  created_at timestamptz not null default now()
);

create index product_price_history_product_id_idx on public.product_price_history (product_id);

alter table public.product_price_history enable row level security;

-- Append-only, comme transactions/logs/order_payments/purchase_losses.
create trigger trg_product_price_history_immutable
  before update or delete on public.product_price_history
  for each row execute function public.fn_block_mutation();

-- Lecture large scopée société (via le produit concerné), écriture uniquement par la RPC
-- ci-dessous (aucune policy insert).
create policy product_price_history_select on public.product_price_history
  for select to authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_price_history.product_id
        and (public.current_role_name() = 'admin' or p.company_id = public.current_company_id())
    )
  );

-- Même rôles que la création/modification d'un produit (Phase 9 : catalogue partagé
-- entre warehouse_manager et production_manager). N'insère une ligne d'historique que si
-- le prix change réellement (évite du bruit si le formulaire est soumis sans
-- modification).
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
  v_role text := public.current_role_name();
  v_caller_company uuid := public.current_company_id();
  v_product public.products;
begin
  if v_role is null or v_role not in ('warehouse_manager', 'production_manager') then
    raise exception 'Rôle % non autorisé à modifier le prix d''un produit', coalesce(v_role, '(aucun)');
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

grant execute on function public.update_product_price(uuid, numeric, text) to authenticated;
