-- Demande client : le Gérant ne doit plus pouvoir annuler un achat (bon de commande)
-- qu'il a lui-même créé -- même logique de séparation des tâches que
-- achats.creer/achats.receptionner (conflit d'attribution) ou
-- ventes.creer_commande/ventes.valider_commande, mais achats.annuler n'a jamais été mis
-- en conflit avec achats.creer (0032_attributions.sql accorde d'ailleurs les deux au
-- Gérant simultanément par défaut) -- un conflit d'attribution rendrait donc
-- l'annulation impossible pour QUICONQUE tant qu'aucun autre profil ne détient
-- achats.annuler seul. Choix retenu : un contrôle ciblé sur l'enregistrement (créateur
-- ≠ personne qui annule), pas un conflit d'attribution global -- un autre titulaire de
-- achats.annuler (ou le même Gérant sur l'achat d'un collègue) reste autorisé.

create or replace function public.cancel_purchase(purchase_id uuid)
returns public.purchases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_company uuid := public.current_company_id();
  v_purchase public.purchases;
begin
  if not public.has_attribution('achats.annuler') then
    raise exception 'Non autorisé à annuler un achat';
  end if;

  select * into v_purchase from public.purchases p where p.id = cancel_purchase.purchase_id;

  if v_purchase is null then
    raise exception 'Achat introuvable';
  end if;

  if v_purchase.company_id is distinct from v_caller_company then
    raise exception 'Impossible d''annuler un achat d''une autre société';
  end if;

  if v_purchase.user_id = auth.uid() then
    raise exception 'Le créateur d''un achat ne peut pas annuler son propre achat';
  end if;

  if v_purchase.status <> 'pending' then
    raise exception 'Seul un achat en attente peut être annulé (statut actuel : %)', v_purchase.status;
  end if;

  update public.purchases set status = 'cancelled' where id = v_purchase.id
  returning * into v_purchase;

  return v_purchase;
end;
$$;
