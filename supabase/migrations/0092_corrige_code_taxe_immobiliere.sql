-- Corrige le code du compte "Taxe immobilière", seeded en 647 par
-- 0027_precompte_isb_taxe_immobiliere.sql. Confirmé sur 2 sources indépendantes
-- (plan-comptable-ohada.com/compte/64.html) : 647 SYSCOHADA est "Pénalités et amendes
-- fiscales", sans rapport. Le bon compte pour un impôt sur la propriété d'un immeuble
-- bâti ou non bâti est 6411 "Impôts fonciers et taxes annexes" (sous 641 "Impôts et
-- taxes directs", même famille que 6412 "Patentes, licences et taxes annexes" déjà
-- identifié pour la taxe professionnelle -- non corrigé ici, hors périmètre de cette
-- demande).
--
-- Aucune RPC ne référence '647' (grep confirmé) : ce compte n'a jamais été utilisé par une
-- écriture automatique (voir 0027 -- "AUCUN calcul automatique n'est branché sur les
-- transactions dans cette passe"), donc un simple rename suffit, rien d'autre à mettre à
-- jour.

update public.chart_of_accounts
  set code = '6411', name = 'Impôts fonciers et taxes annexes'
  where code = '647' and name = 'Taxe immobilière';
