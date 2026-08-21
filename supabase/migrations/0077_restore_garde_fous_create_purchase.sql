-- Corrige une régression introduite par 0075_prix_de_revient_produit.sql : sa réécriture
-- de create_purchase() a été basée par erreur sur la version de
-- 0046_frais_a_la_creation.sql plutôt que sur la dernière version réelle
-- (0048_archivage.sql), qui avait ajouté trois garde-fous entre-temps -- fournisseur
-- actif, magasin actif, produit actif. Ces trois vérifications ont donc disparu
-- silencieusement dans 0075 puis 0076 : un achat pouvait être créé sur un fournisseur,
-- un magasin ou un produit archivé. Découvert via la suite d'intégration
-- (archivage.test.ts) en vérifiant ce changement contre Formation.

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

  insert into public.purchases (company_id, supplier_id, warehouse_id, user_id, status)
  values (v_caller_company, v_supplier_id, v_warehouse_id, auth.uid(), 'pending')
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
      coalesce((v_item ->> 'unit_cost')::numeric, v_product.purchase_cost)
    );
  end loop;

  return v_purchase;
end;
$$;
