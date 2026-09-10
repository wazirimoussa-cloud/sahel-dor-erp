-- Référentiel de base du projet Formation (société + plan comptable).
-- À exécuter UNE FOIS contre le NOUVEAU projet Supabase Formation, après `supabase db push`
-- et avant `provision-formation-auth.mjs`.
--
-- Contexte : séparation Formation / Production — voir docs/runbook-separation-formation.md.
-- Extrait du projet partagé le 2026-09-10. Formation garde volontairement le même
-- company_id `…0f0` que dans le projet partagé (zéro changement de code).
--
-- Ne contient PAS les comptes utilisateurs ni leurs attributions : ils dépendent de
-- auth.users et sont créés par provision-formation-auth.mjs.
--
-- Idempotent (on conflict do nothing).

begin;

insert into public.companies (
  id, name, address, nif, rccm,
  vat_rate, capital_social,
  impot_societes_rate, precompte_isb_rate, taxe_immobiliere_rate,
  irvm_dividendes_rate, irvm_obligations_rate, irvm_plus_values_cession_rate,
  droits_enregistrement_actes_societe, droits_enregistrement_fonds_commerce_rate,
  redevance_domaine_public_rate,
  taxe_professionnelle_rate, taxe_professionnelle_ca_annuel,
  taxe_professionnelle_valeur_locative, taxe_professionnelle_plancher,
  taxe_professionnelle_droit_fixe_pour_mille,
  taxe_professionnelle_droit_proportionnel_rate,
  taxe_publicite_panneau_papier_rate, taxe_publicite_panneau_autre_rate
) values (
  '00000000-0000-0000-0000-0000000000f0', 'Sahel d''Or — Formation',
  'Château 1, Niamey, Niger', '171228/R', 'NE-NIM-01-2026-B13-00400',
  19, 0,
  30, 2, 1,
  10, 6, 7,
  6000, 10,
  5000,
  0, 0,
  0, 150000,
  1,
  10,
  10000, 15000
)
on conflict (id) do nothing;

insert into public.chart_of_accounts (company_id, code, name)
values
  ('00000000-0000-0000-0000-0000000000f0', '21',   'Immobilisations'),
  ('00000000-0000-0000-0000-0000000000f0', '28',   'Amortissements des immobilisations'),
  ('00000000-0000-0000-0000-0000000000f0', '31',   'Matières premières'),
  ('00000000-0000-0000-0000-0000000000f0', '36',   'Stocks de produits en cours et produits finis'),
  ('00000000-0000-0000-0000-0000000000f0', '401',  'Fournisseurs'),
  ('00000000-0000-0000-0000-0000000000f0', '411',  'Clients'),
  ('00000000-0000-0000-0000-0000000000f0', '421',  'Personnel — rémunérations dues'),
  ('00000000-0000-0000-0000-0000000000f0', '425',  'Personnel — avances et acomptes'),
  ('00000000-0000-0000-0000-0000000000f0', '431',  'Sécurité sociale'),
  ('00000000-0000-0000-0000-0000000000f0', '4431', 'TVA collectée'),
  ('00000000-0000-0000-0000-0000000000f0', '4452', 'TVA déductible'),
  ('00000000-0000-0000-0000-0000000000f0', '447',  'État — impôts retenus à la source'),
  ('00000000-0000-0000-0000-0000000000f0', '4494', 'Précompte ISB (Etat)'),
  ('00000000-0000-0000-0000-0000000000f0', '521',  'Banque d''opération'),
  ('00000000-0000-0000-0000-0000000000f0', '522',  'Banque de fonctionnement'),
  ('00000000-0000-0000-0000-0000000000f0', '571',  'Caisse'),
  ('00000000-0000-0000-0000-0000000000f0', '601',  'Achats de marchandises'),
  ('00000000-0000-0000-0000-0000000000f0', '608',  'Frais accessoires d''achat (transport, manutention)'),
  ('00000000-0000-0000-0000-0000000000f0', '646',  'Taxe professionnelle (patente)'),
  ('00000000-0000-0000-0000-0000000000f0', '647',  'Taxe immobilière'),
  ('00000000-0000-0000-0000-0000000000f0', '661',  'Rémunérations directes versées au personnel'),
  ('00000000-0000-0000-0000-0000000000f0', '675',  'Valeurs comptables des cessions d''immobilisations'),
  ('00000000-0000-0000-0000-0000000000f0', '695',  'Impots sur les benefices (IS)'),
  ('00000000-0000-0000-0000-0000000000f0', '701',  'Ventes de marchandises'),
  ('00000000-0000-0000-0000-0000000000f0', '73',   'Production stockée'),
  ('00000000-0000-0000-0000-0000000000f0', '775',  'Produits des cessions d''immobilisations')
on conflict (company_id, code) do nothing;

commit;
