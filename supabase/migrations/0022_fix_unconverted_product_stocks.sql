-- Correctif suite à 0021 : plusieurs produits n'ont jamais eu de ligne product_stocks —
-- un écart préexistant où products.stock (créé via le formulaire Produits, insert direct
-- sans passer par une transaction) n'a jamais été synchronisé avec product_stocks (source
-- de vérité par magasin, alimentée uniquement par le trigger fn_apply_transaction_stock).
-- La conversion en tonnes de 0021, basée sur une boucle sur product_stocks, a donc
-- silencieusement laissé le stock de 5 produits dans l'ancienne unité (sacs) : Arachide
-- décortiquée, Mil, Niébé, Sucre - brésilien (Production) et Riz local (formation).
-- Cette migration convertit directement leur products.stock, puis crée une ligne
-- product_stocks au "Magasin principal" de leur société pour tous les produits qui n'en
-- ont aucune (ces 5, plus les 8 nouveaux produits huile créés à stock 0 par 0021) — pour
-- qu'ils apparaissent dans la synthèse de stock et que les futurs mouvements les
-- affectent correctement.

update public.products set stock = round(stock * 0.05, 3)
  where id = 'ca45d1a1-c35a-42ee-aea3-a92287159e9d'; -- Arachide décortiquée (Production)

update public.products set stock = round(stock * 0.1, 3)
  where id = '49f26829-b41f-41b6-aeb2-1eebadcffe64'; -- Mil (Production)

update public.products set stock = round(stock * 0.1, 3)
  where id = '1c558f3f-cbbe-4738-b07d-26b9511121a9'; -- Niébé (Production)

update public.products set stock = round(stock * 0.05, 3)
  where id = '8e19782e-476c-4785-b157-143cb982e12b'; -- Sucre - brésilien (Production)

update public.products set stock = round(stock * 0.05, 3)
  where id = '21dd128f-56f3-4ef1-ae2c-a28feb513698'; -- Riz local (formation)

insert into public.product_stocks (product_id, warehouse_id, stock)
select p.id, w.id, p.stock
from public.products p
join public.warehouses w on w.company_id = p.company_id and w.name = 'Magasin principal'
left join public.product_stocks ps on ps.product_id = p.id
where ps.id is null
on conflict (product_id, warehouse_id) do update set stock = excluded.stock;
