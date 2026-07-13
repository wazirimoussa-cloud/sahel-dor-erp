-- Correctif : products.stock (total dénormalisé) était désynchronisé de product_stocks
-- (source de vérité par magasin) pour Sorgho dans les deux sociétés, d'un écart
-- identique de 100 (avant conversion en tonnes) dans les deux cas — un écart préexistant
-- à la Phase 14, découvert lors de sa vérification, sans lien avec la conversion
-- d'unité elle-même (le trigger fn_apply_transaction_stock met toujours les deux tables
-- à jour ensemble ; cet écart provient donc d'une désynchronisation antérieure, non
-- élucidée). product_stocks fait foi car alimentée exclusivement par de vraies
-- transactions ; products.stock est réconcilié dessus.
update public.products p
set stock = coalesce((
  select sum(ps.stock) from public.product_stocks ps where ps.product_id = p.id
), 0)
where p.name in ('Sorgho', 'Sorgho (formation)');
