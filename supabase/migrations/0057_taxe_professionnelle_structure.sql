-- La taxe professionnelle (patente) n'est pas un taux unique mais un droit
-- fixe + un droit proportionnel (Art. 174-176 CGI, Niger) — la colonne
-- taxe_professionnelle_rate posée en 0030 ne peut pas la représenter et reste
-- inutilisée (voir point 44 du README). Ces 3 nouvelles colonnes portent les
-- 3 constantes légales de calcul, identiques pour toute personne morale :
--   - droit fixe = 1‰ du chiffre d'affaires de l'année précédente (Art. 175)
--   - plancher du droit fixe = 150 000 FCFA (Art. 175)
--   - droit proportionnel = 10% de la valeur locative des locaux professionnels (Art. 176)
-- Contrairement aux autres taux fiscaux préparés jusqu'ici, ces 3 valeurs ne
-- dépendent d'aucun fait propre à la société (immatriculation, catégorie de
-- bien...) : ce sont des constantes du texte, seedées sans ambiguïté pour les
-- deux sociétés. Toujours aucun calcul automatique : l'app ne suit ni le
-- chiffre d'affaires annuel ni la valeur locative des locaux nécessaires pour
-- produire un montant réel.
alter table public.companies
  add column taxe_professionnelle_droit_fixe_pour_mille numeric(5, 2) not null default 1,
  add column taxe_professionnelle_plancher numeric(12, 2) not null default 150000,
  add column taxe_professionnelle_droit_proportionnel_rate numeric(5, 2) not null default 10;
