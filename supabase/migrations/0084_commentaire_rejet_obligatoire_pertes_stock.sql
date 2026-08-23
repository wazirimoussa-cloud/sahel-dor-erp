-- stock_loss_requests.rejection_reason existe déjà (0031) mais n'était jamais vraiment
-- obligatoire : reject_stock_loss (0031/0067) accepte p_rejection_reason sans la valider,
-- seule la case grisée côté frontend (StockLossRequestsPage.tsx) empêchait un envoi vide --
-- contournable par un appel RPC direct. Applique le même principe que request_stock_loss
-- pour p_reason (0031, ligne 84-86) : validation RPC + verrou en base, pas seulement côté
-- client. Aucune ligne existante ne viole la contrainte (vérifié avant migration).

alter table public.stock_loss_requests
  add constraint stock_loss_requests_rejection_reason_required
  check (status <> 'rejected' or (rejection_reason is not null and trim(rejection_reason) <> ''));

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

  if trim(coalesce(p_rejection_reason, '')) = '' then
    raise exception 'Un commentaire est requis pour rejeter une demande';
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
