-- Complète la structure de la taxe professionnelle (0057) avec les deux
-- données propres à la société nécessaires au calcul réel (Art. 175-176 CGI) :
--   - chiffre d'affaires de l'exercice précédent (assiette du droit fixe)
--   - valeur locative des locaux professionnels (assiette du droit proportionnel)
-- Saisie manuelle par le comptable, comme convenu avec l'utilisateur : le CA
-- n'est pas dérivé des écritures comptables réelles (périmètre exercice/HT-TTC/
-- Formation-Production à trancher séparément si besoin plus tard), et la
-- valeur locative n'a aucune source dans l'app (pas de suivi immobilier). Un
-- seul montant par société, pas par entrepôt.
alter table public.companies
  add column taxe_professionnelle_ca_annuel numeric(14, 2) not null default 0,
  add column taxe_professionnelle_valeur_locative numeric(14, 2) not null default 0;
