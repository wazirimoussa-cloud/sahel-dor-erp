-- Droits d'enregistrement (Livre III CGI, ~59 articles couvrant des dizaines
-- de natures d'actes — successions, immeubles, jugements, contrats de
-- mariage, aéronefs...). La quasi-totalité ne concerne pas l'activité d'une
-- SARL commerciale comme Sahel d'Or ; seuls 2 cas jugés pertinents avec
-- l'utilisateur sont modélisés, comme référence (aucun calcul automatique,
-- même traitement que le reste des taux fiscaux préparés jusqu'ici) :
--   - Art. 489 : actes de société (constitution, augmentation de capital,
--     fusion, cession d'actions/parts sociales) — droit FIXE de 6 000 FCFA,
--     seul cas qui concerne le fonctionnement courant d'une SARL.
--   - Cession de fonds de commerce ou de clientèle — droit de 10%, pertinent
--     si Sahel d'Or rachète/revend un jour un commerce complet plutôt qu'une
--     opération d'achat-revente classique de stock.
-- Le reste du tarif (successions, immeubles, jugements, contrats de
-- mariage, aéronefs...) reste hors périmètre, hors sujet pour l'activité.
alter table public.companies
  add column droits_enregistrement_actes_societe numeric(10, 2) not null default 6000,
  add column droits_enregistrement_fonds_commerce_rate numeric(5, 2) not null default 10;
