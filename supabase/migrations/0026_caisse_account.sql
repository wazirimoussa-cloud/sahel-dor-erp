-- Complete la hierarchie de tresorerie : Banque d'operation -> Banque de fonctionnement
-- -> Caisse. Ajoute le compte "Caisse" (571, classe Tresorerie SYSCOHADA) pour chaque
-- societe existante, destine a etre approvisionne par le compte Banque de fonctionnement
-- (522). Structure comptable uniquement : le mecanisme de ravitaillement de la caisse et
-- l'enregistrement des depenses en especes restent hors perimetre, a cadrer separement
-- (meme decision que pour les comptes 521/522 en 0025).

insert into public.chart_of_accounts (company_id, code, name)
select id, '571', 'Caisse' from public.companies
on conflict (company_id, code) do nothing;
