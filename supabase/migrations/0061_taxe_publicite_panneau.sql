-- Taxe sur la publicité commerciale extérieure (Livre III, Art. 23-24 CGI) :
-- taxe COMMUNALE, tarif par support et par unité de surface — pas un
-- pourcentage. 5 catégories de support existent (prospectus, panneaux,
-- annonces lumineuses, projections, haut-parleurs), chacune avec sa propre
-- unité de tarification (par 100 unités distribuées, par m²/an, par
-- opération, par jour...). Seul le cas le plus universel pour un commerce
-- physique est repris (décision confirmée avec l'utilisateur) : panneau/
-- enseigne extérieure, avec ses 2 variantes de matériau —
--   - papier ordinaire non protégé : 10 000 FCFA / m² / an
--   - autre nature (toile, bois, porcelaine, banderole, véhicule pub.) :
--     15 000 FCFA / m² / an
-- Les autres supports (tracts, haut-parleurs, annonces lumineuses,
-- projections en salle) restent hors périmètre, trop situationnels. Comme
-- pour le reste de l'écran : référence de calcul manuel, aucune écriture
-- comptable automatique, et l'app ne suit pas la surface réelle des
-- panneaux (donnée à saisir manuellement au moment du calcul).
alter table public.companies
  add column taxe_publicite_panneau_papier_rate numeric(10, 2) not null default 10000,
  add column taxe_publicite_panneau_autre_rate numeric(10, 2) not null default 15000;
