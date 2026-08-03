-- Ciblage d'un lot precis lors d'une declaration de perte de stock, au lieu de toujours
-- consommer en FEFO generique (0037_stock_lots.sql). Cas d'usage : un lot precis est
-- identifie comme abime/perime en magasin -- le declarant sait EXACTEMENT quel lot est
-- concerne, pas seulement "le produit X au magasin Y". Decision actee : si le lot cible
-- n'a plus assez de quantite restante au moment de l'approbation, l'approbation echoue
-- avec une exception explicite -- PAS de repli automatique sur les autres lots en FEFO,
-- pour ne pas silencieusement faire sortir un stock different de ce qui a ete declare et
-- valide par le Controleur.
--
-- Comme pour 0037, le point d'entree reste fn_apply_transaction_stock (seul point de
-- verite pour tous les mouvements) : une nouvelle colonne transactions.target_lot_id,
-- nullable, lui indique quel lot consommer specifiquement quand elle est renseignee.
-- Comportement par defaut inchange (target_lot_id null => FEFO generique existant),
-- donc retrocompatible avec les 5 autres RPC qui touchent au stock et le mouvement
-- manuel direct.

-- ============================================================================
-- 1. Colonnes : le lot cible transite de la demande (stock_loss_requests.lot_id) vers le
--    mouvement de stock reellement pose (transactions.target_lot_id) au moment de
--    l'approbation -- deux colonnes distinctes car une demande peut ne jamais etre
--    approuvee (rejetee), et une transaction peut naitre d'un mouvement qui n'a jamais
--    ete une demande de perte (les 6 autres RPC + le mouvement manuel laissent la
--    colonne a null).
-- ============================================================================

alter table public.transactions add column target_lot_id uuid references public.stock_lots (id);

alter table public.stock_loss_requests add column lot_id uuid references public.stock_lots (id);

-- ============================================================================
-- 2. Consommation d'un lot precis : verrouille le lot cible (for update, meme discipline
--    que fn_consume_stock_lots), verifie qu'il correspond bien au produit/magasin du
--    mouvement (empeche de detourner un lot d'un autre produit/magasin), puis verifie la
--    quantite restante -- exception explicite si insuffisante, aucun repli sur les
--    autres lots du produit/magasin.
-- ============================================================================

create function public.fn_consume_specific_lot(
  p_transaction_id uuid,
  p_lot_id uuid,
  p_product_id uuid,
  p_warehouse_id uuid,
  p_quantity numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lot public.stock_lots;
begin
  select * into v_lot from public.stock_lots where id = p_lot_id for update;

  if v_lot is null then
    raise exception 'Lot introuvable';
  end if;

  if v_lot.product_id is distinct from p_product_id or v_lot.warehouse_id is distinct from p_warehouse_id then
    raise exception 'Le lot ciblé ne correspond pas au produit/magasin de ce mouvement';
  end if;

  if v_lot.quantity_remaining < p_quantity then
    raise exception 'Quantité restante insuffisante sur le lot ciblé (% disponible, % demandé)',
      v_lot.quantity_remaining, p_quantity;
  end if;

  update public.stock_lots set quantity_remaining = quantity_remaining - p_quantity where id = p_lot_id;

  insert into public.transaction_lot_allocations (transaction_id, lot_id, quantity)
  values (p_transaction_id, p_lot_id, p_quantity);
end;
$$;

-- ============================================================================
-- 3. fn_apply_transaction_stock (create or replace, signature de trigger inchangee) :
--    seule modification, la branche v_delta < 0 bascule sur fn_consume_specific_lot
--    quand new.target_lot_id est renseigne. Reste du corps repris a l'identique de
--    0037_stock_lots.sql.
-- ============================================================================

create or replace function public.fn_apply_transaction_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delta numeric(12, 3);
  v_unit_cost numeric(12, 2);
  v_company_id uuid;
begin
  v_delta := case new.type
    when 'IN' then new.quantity
    when 'OUT' then -new.quantity
    when 'ADJUSTMENT' then new.quantity
  end;

  update public.products
  set stock = stock + v_delta
  where id = new.product_id;

  update public.product_stocks
  set stock = stock + v_delta
  where product_id = new.product_id and warehouse_id = new.warehouse_id;

  if not found then
    insert into public.product_stocks (product_id, warehouse_id, stock)
    values (new.product_id, new.warehouse_id, v_delta);
  end if;

  if v_delta > 0 then
    v_unit_cost := new.unit_cost;

    if v_unit_cost is null then
      select unit_cost into v_unit_cost from public.purchase_items
      where purchase_id = new.purchase_id and product_id = new.product_id limit 1;
    end if;

    if v_unit_cost is null then
      select unit_cost into v_unit_cost from public.production_items
      where production_id = new.production_id and product_id = new.product_id limit 1;
    end if;

    if v_unit_cost is null then
      select unit_cost into v_unit_cost from public.transformation_outputs
      where transformation_id = new.transformation_id and product_id = new.product_id limit 1;
    end if;

    if v_unit_cost is null then
      select price into v_unit_cost from public.products where id = new.product_id;
    end if;

    select company_id into v_company_id from public.products where id = new.product_id;

    insert into public.stock_lots (
      company_id, product_id, warehouse_id, quantity_received, quantity_remaining,
      unit_cost, expiry_date, source_transaction_id
    )
    values (
      v_company_id, new.product_id, new.warehouse_id, v_delta, v_delta,
      coalesce(v_unit_cost, 0), new.expiry_date, new.id
    );
  elsif v_delta < 0 then
    if new.target_lot_id is not null then
      perform public.fn_consume_specific_lot(new.id, new.target_lot_id, new.product_id, new.warehouse_id, -v_delta);
    else
      perform public.fn_consume_stock_lots(new.id, new.product_id, new.warehouse_id, -v_delta);
    end if;
  end if;

  return new;
end;
$$;

-- ============================================================================
-- 4. request_stock_loss : nouveau parametre p_lot_id (uuid, nullable, en dernier pour ne
--    pas casser les appels positionnels existants). Signature changee => drop puis
--    create (create or replace ne remplace pas une fonction dont le nombre de parametres
--    differe, il cree une surcharge -- meme convention que dispose_fixed_asset en 0066).
--    Validation a la declaration : uniquement existence + appartenance du lot au
--    produit/magasin/societe -- PAS de verification de quantite suffisante ici (le stock
--    peut bouger entre la declaration et l'approbation ; c'est fn_consume_specific_lot,
--    invoquee a l'approbation, qui fait foi sur la quantite disponible).
--
--    Profite de ce passage pour corriger un bug latent decouvert en verifiant ce
--    changement : cette fonction verifiait encore current_role_name() (role fixe
--    utilisateurs.role_id), abandonne depuis le passage aux attributions granulaires
--    (0032_attributions.sql, "Attributions detachees du role") -- role_id n'est plus
--    renseigne pour les comptes actuels, donc la declaration d'une perte etait cassee
--    pour tout le monde. approve_stock_loss avait deja ete corrigee (has_attribution,
--    voir 0037) ; request_stock_loss et reject_stock_loss ne l'avaient jamais ete.
-- ============================================================================

drop function if exists public.request_stock_loss(uuid, uuid, numeric, text, numeric);

create function public.request_stock_loss(
  p_product_id uuid,
  p_warehouse_id uuid,
  p_quantity numeric,
  p_reason text,
  p_repackaged_quantity numeric default null,
  p_lot_id uuid default null
)
returns public.stock_loss_requests
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_company uuid := public.current_company_id();
  v_request public.stock_loss_requests;
  v_lot public.stock_lots;
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

  if p_lot_id is not null then
    select * into v_lot from public.stock_lots where id = p_lot_id;

    if v_lot is null or v_lot.company_id is distinct from v_company then
      raise exception 'Lot introuvable pour cette société';
    end if;

    if v_lot.product_id is distinct from p_product_id or v_lot.warehouse_id is distinct from p_warehouse_id then
      raise exception 'Le lot ciblé ne correspond pas au produit/magasin sélectionné';
    end if;
  end if;

  insert into public.stock_loss_requests (
    company_id, product_id, warehouse_id, quantity, repackaged_quantity, reason, requested_by, lot_id
  )
  values (v_company, p_product_id, p_warehouse_id, p_quantity, p_repackaged_quantity, p_reason, auth.uid(), p_lot_id)
  returning * into v_request;

  return v_request;
end;
$$;

grant execute on function public.request_stock_loss(uuid, uuid, numeric, text, numeric, uuid) to authenticated;

-- ============================================================================
-- 5. approve_stock_loss (create or replace, signature p_request_id inchangee) : transmet
--    v_request.lot_id (peut etre null -- comportement FEFO par defaut inchange) comme
--    target_lot_id sur les DEUX chemins de sortie -- la perte seche (ADJUSTMENT negatif)
--    ET l'intrant du reconditionnement (OUT) -- pour que le ciblage soit respecte quel
--    que soit le type de perte. L'extrant du reconditionnement (IN) n'a pas de notion de
--    lot cible, c'est une entree.
-- ============================================================================

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
  v_out_transaction_id uuid;
  v_expiry_date date;
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
    insert into public.transactions (product_id, type, quantity, user_id, warehouse_id, note, target_lot_id)
    values (
      v_request.product_id, 'ADJUSTMENT', -v_request.quantity, v_request.requested_by,
      v_request.warehouse_id, v_request.reason, v_request.lot_id
    )
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

    insert into public.transactions (product_id, type, quantity, user_id, warehouse_id, transformation_id, target_lot_id)
    values (
      v_request.product_id, 'OUT', v_request.quantity, v_request.requested_by,
      v_request.warehouse_id, v_transformation.id, v_request.lot_id
    )
    returning id into v_out_transaction_id;

    select min(sl.expiry_date) filter (where sl.expiry_date is not null)
    into v_expiry_date
    from public.transaction_lot_allocations tla
    join public.stock_lots sl on sl.id = tla.lot_id
    where tla.transaction_id = v_out_transaction_id;

    insert into public.transformation_outputs (transformation_id, product_id, quantity, unit_cost)
    select v_transformation.id, v_request.product_id, v_request.repackaged_quantity, price
    from public.products where id = v_request.product_id;

    insert into public.transactions (product_id, type, quantity, user_id, warehouse_id, transformation_id, expiry_date)
    values (
      v_request.product_id, 'IN', v_request.repackaged_quantity, v_request.requested_by,
      v_request.warehouse_id, v_transformation.id, v_expiry_date
    );

    update public.stock_loss_requests
    set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), transformation_id = v_transformation.id
    where id = p_request_id
    returning * into v_request;
  end if;

  return v_request;
end;
$$;

-- ============================================================================
-- 6. reject_stock_loss (create or replace, signature inchangee) : meme correction que
--    request_stock_loss ci-dessus -- current_role_name() (role_id = 'controller')
--    remplace par has_attribution('pertes_stock.approuver'), coherent avec
--    approve_stock_loss et avec le frontend (StockLossRequestsPage.tsx gate deja le
--    bouton Rejeter par hasAttribution("pertes_stock.approuver")).
-- ============================================================================

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
