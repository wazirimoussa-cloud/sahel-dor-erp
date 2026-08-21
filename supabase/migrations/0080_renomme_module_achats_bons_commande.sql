-- Renomme le module "Achats" en "Bons de commande" dans l'interface (demande client) --
-- met à jour les libellés d'attribution affichés dans l'écran de gestion des droits
-- (UserAttributionsPanel.tsx). Les identifiants internes (action_key = 'achats.creer',
-- 'achats.annuler', 'achats.receptionner', module = 'achats') restent inchangés --
-- seul le texte affiché change, aucun impact sur les RLS/RPC qui vérifient ces clés.

update public.attributions set label = 'Créer un bon de commande' where action_key = 'achats.creer';
update public.attributions set label = 'Annuler un bon de commande' where action_key = 'achats.annuler';
update public.attributions set label = 'Réceptionner un bon de commande' where action_key = 'achats.receptionner';
