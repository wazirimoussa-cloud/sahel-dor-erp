-- Mentions légales obligatoires sur les documents professionnels (le certificat
-- d'immatriculation NIF est explicite : "l'intéressé est tenu de faire figurer sur
-- tous les documents professionnels (correspondances, factures, déclarations...) ledit
-- numéro sous peine de sanctions prévues par les textes en vigueur").

alter table public.companies add column nif text;
alter table public.companies add column rccm text;
alter table public.companies add column address text;

-- Données réelles issues du Certificat d'immatriculation NIF (DGI, 28/07/2026) et de
-- l'extrait RCCM (Tribunal de Commerce de Niamey, 28/07/2026) -- identiques sur
-- Formation et Production, puisqu'il s'agit de la même société réelle.
update public.companies
set nif = '171228/R',
    rccm = 'NE-NIM-01-2026-B13-00400',
    address = 'Château 1, Niamey, Niger'
where name in ('Sahel d''Or — Formation', 'Sahel d''Or — Production');

-- Le capital social de Production était déjà correctement à 3 000 000 FCFA ; Formation
-- ne l'avait jamais renseigné (0 par défaut) -- alignée sur la même valeur réelle
-- (Procès-verbal des décisions constitutives, 29/06/2026 : 300 parts de 10 000 FCFA).
update public.companies set capital_social = 3000000 where name = 'Sahel d''Or — Formation';
