-- Renomme "commande" en "bon de commande" pour les libellés d'attribution du module
-- ventes liés à la commande elle-même (créer/valider/annuler) -- action_key/module
-- restent 'ventes.*'/'ventes' inchangés. Le libellé du module "Ventes" lui-même n'est
-- pas renommé : il couvre aussi ventes.encaisser_paiement (encaissement), qui n'est pas
-- un concept de bon de commande.

update public.attributions set label = 'Créer un bon de commande' where action_key = 'ventes.creer_commande';
update public.attributions set label = 'Valider un bon de commande' where action_key = 'ventes.valider_commande';
update public.attributions set label = 'Annuler un bon de commande' where action_key = 'ventes.annuler_commande';
