-- Impôt sur le Revenu des Valeurs Mobilières (IRVM, Art. 70-78 CGI) : taux
-- simples et sans ambiguïté (Art. 74), contrairement au reste de l'inventaire
-- fiscal encore écarté (voir point 46 du README) :
--   - 10% sur les dividendes (7% seulement si la société est cotée sur une
--     bourse agréée CREPMF/UEMOA — non pertinent pour Sahel d'Or, SARL non
--     cotée, mais noté dans l'aide du champ)
--   - 7% sur les plus-values de cession d'actions et parts sociales
--   - 6% sur les revenus d'obligations
-- Ne concerne Sahel d'Or qu'en cas d'événement rare (distribution de
-- dividendes, cession de parts) — comme les autres taux, référence de calcul
-- manuel uniquement, aucune écriture comptable automatique.
alter table public.companies
  add column irvm_dividendes_rate numeric(5, 2) not null default 10,
  add column irvm_plus_values_cession_rate numeric(5, 2) not null default 7,
  add column irvm_obligations_rate numeric(5, 2) not null default 6;
