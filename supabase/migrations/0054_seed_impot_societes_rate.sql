-- Seed du taux d'Impôt sur les Sociétés (IS) à 30%, seule des 4 impositions de
-- l'inventaire fiscal (points 28/31 du README) dont le taux est une donnée
-- inconditionnelle (taux unique pour une SARL commerciale, contrairement au
-- précompte ISB/IBA et à la taxe immobilière qui dépendent respectivement du
-- statut du fournisseur et de la catégorie du bien — ces deux-là restent à 0,
-- à saisir directement via l'écran "Paramètres fiscaux" une fois la situation
-- réelle de la société connue). Valeur transmise par l'utilisateur à partir de
-- ses recherches préalables, sous réserve de vérification directe dans le CGI
-- à jour — non extraite de l'Ordonnance N°2025-44 elle-même (voir points 28/31).
update public.companies
set impot_societes_rate = 30
where impot_societes_rate = 0;
