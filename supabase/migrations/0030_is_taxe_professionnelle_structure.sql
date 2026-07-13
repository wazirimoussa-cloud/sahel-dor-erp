-- Structure preparee pour l'IS (Impot sur les Societes) et la Taxe Professionnelle
-- (patente), meme demarche que 0027 (Precompte ISB / Taxe Immobiliere) : aucun taux
-- n'est fixe par l'Ordonnance N-2025-44 pour ces deux impositions (elle ne modifie que
-- des articles d'exoneration/base de calcul du Code General des Impots existant), donc
-- aucun calcul automatique n'est branche tant que le taux reel n'est pas confirme.
alter table public.companies
  add column impot_societes_rate numeric(5, 2) not null default 0,
  add column taxe_professionnelle_rate numeric(5, 2) not null default 0;

insert into public.chart_of_accounts (company_id, code, name)
select id, '695', 'Impots sur les benefices (IS)' from public.companies
on conflict (company_id, code) do nothing;

insert into public.chart_of_accounts (company_id, code, name)
select id, '646', 'Taxe professionnelle (patente)' from public.companies
on conflict (company_id, code) do nothing;
