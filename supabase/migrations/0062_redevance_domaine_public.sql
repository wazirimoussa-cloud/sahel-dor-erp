-- Droits fonciers (Livre foncier CGI) : surtout une grille de prix
-- d'acquisition de terrain domanial (Art. 912, dizaines de villes/zones,
-- 100 à 2000+ FCFA/m² selon la commune et l'usage) et une exception
-- historique (Art. 913, concessions attribuées avant 1993) — trop
-- conditionnel/complexe pour un champ de référence. Un seul point est
-- propre et non conditionnel, décision confirmée avec l'utilisateur (Sahel
-- d'Or occupe un terrain du domaine public pour son activité) :
--   - Art. 914 : redevance annuelle pour occupation du domaine public à
--     usage commercial, 5 000 FCFA/m²/an.
-- Comme pour le reste de l'écran : référence de calcul manuel, aucune
-- écriture comptable automatique, et l'app ne suit pas la surface réelle
-- occupée (à multiplier manuellement).
alter table public.companies
  add column redevance_domaine_public_rate numeric(10, 2) not null default 5000;
