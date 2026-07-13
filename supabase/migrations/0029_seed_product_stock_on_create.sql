-- Root-cause fix for the Phase 14 gap (patched retroactively in 0022/0023, reproduced
-- since then for every product created via the "Produits" form): products.stock is a
-- denormalized display value, but the real source of truth for stock transactions is
-- product_stocks per warehouse. Creating a product with an initial stock > 0 without a
-- matching product_stocks row makes fn_apply_transaction_stock reject the very first
-- sale/purchase of that product (it correctly sees zero stock at any warehouse).
create or replace function public.fn_seed_product_stock()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_warehouse_id uuid;
begin
  if new.stock > 0 then
    select id into v_warehouse_id
    from public.warehouses
    where company_id = new.company_id and name = 'Magasin principal'
    limit 1;

    if v_warehouse_id is not null then
      insert into public.product_stocks (product_id, warehouse_id, stock)
      values (new.id, v_warehouse_id, new.stock)
      on conflict (product_id, warehouse_id) do update set stock = excluded.stock;
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_seed_product_stock
after insert on public.products
for each row execute function public.fn_seed_product_stock();
