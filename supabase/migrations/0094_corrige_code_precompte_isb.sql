-- Corrige le dernier écart SYSCOHADA identifié (point 94/95, README) : "Précompte ISB",
-- seedé en 4494 par 0027_precompte_isb_taxe_immobiliere.sql. Confirmé sur 4 vérifications
-- indépendantes (2 pages, recoupées 2 fois chacune) : 4494 réel est "État, subventions
-- d'équipement/investissement à recevoir", sans rapport. Un précompte est une avance/
-- retenue à la source sur un impôt à venir -- exactement la définition du compte
-- **4492** "État, avances et acomptes versés sur impôts" (sous 449 "État, créances et
-- dettes diverses", même famille que 4494).
--
-- Aucune RPC ne référence '4494' (grep confirmé, même situation que 646/647/21) : compte
-- jamais branché sur une écriture automatique, simple renommage.

update public.chart_of_accounts
  set code = '4492', name = 'Précompte ISB (Etat)'
  where code = '4494' and name = 'Précompte ISB (Etat)';
