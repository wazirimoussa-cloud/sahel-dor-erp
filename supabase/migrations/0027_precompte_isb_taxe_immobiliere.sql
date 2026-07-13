-- Prepare la structure pour le precompte P.IS/IBA (Impot sur les Societes / Impot sur
-- les Benefices d'Affaires, Art. 90/92 de l'Ordonnance N-2025-44) et la Taxe Immobiliere
-- (Art. 257) : taux configurable par societe (a 0 par defaut = aucun impact tant que le
-- taux reel n'est pas connu) et comptes dedies dans le plan comptable. AUCUN calcul
-- automatique n'est branche sur les transactions dans cette passe -- le taux exact et le
-- mecanisme d'application (qui precompte, sur quelle operation) restent a confirmer
-- avant toute automatisation, pour eviter de fausser une vraie ecriture fiscale.

alter table public.companies
  add column precompte_isb_rate numeric(5, 2) not null default 0,
  add column taxe_immobiliere_rate numeric(5, 2) not null default 0;

insert into public.chart_of_accounts (company_id, code, name)
select id, '4494', 'Précompte ISB (Etat)' from public.companies
on conflict (company_id, code) do nothing;

insert into public.chart_of_accounts (company_id, code, name)
select id, '647', 'Taxe immobilière' from public.companies
on conflict (company_id, code) do nothing;
