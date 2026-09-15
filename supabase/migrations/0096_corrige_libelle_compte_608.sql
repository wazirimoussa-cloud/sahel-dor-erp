-- Corrige le libellé du compte 608, seedé par 0043_prix_de_revient.sql sous le nom "Frais
-- accessoires d'achat (transport, manutention)" -- convention du PCG français, pas
-- SYSCOHADA : le 608 SYSCOHADA est "Achats d'emballages" (6081 perdus, 6082 récupérables
-- non identifiables, 6083 usage mixte).
--
-- Le code lui-même reste correct (aucun renommage de numéro requis, contrairement aux
-- points précédents) : seul le libellé était trompeur. Compte non utilisé par aucune RPC
-- depuis 0076_retrait_frais_achat.sql (le mécanisme de frais de transport/manutention saisis
-- à l'achat a été supprimé, remplacé par freight_cost/handling_cost sur les produits) --
-- renommage sans aucun impact sur une écriture existante.

update public.chart_of_accounts
  set name = 'Achats d''emballages'
  where code = '608' and name = 'Frais accessoires d''achat (transport, manutention)';
