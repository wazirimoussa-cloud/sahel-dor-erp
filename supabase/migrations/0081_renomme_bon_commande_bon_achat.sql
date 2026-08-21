-- Renomme "Bon de commande" en "Bon d'achat" (demande client, revient sur le choix de
-- 0080) -- même principe : seuls les libellés d'attribution affichés changent,
-- action_key/module restent 'achats.*'/'achats'.

update public.attributions set label = 'Créer un bon d''achat' where action_key = 'achats.creer';
update public.attributions set label = 'Annuler un bon d''achat' where action_key = 'achats.annuler';
update public.attributions set label = 'Réceptionner un bon d''achat' where action_key = 'achats.receptionner';
