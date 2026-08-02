-- Seed du taux de Taxe immobilière à 1%, conformément à l'Article 155 du Code
-- Général des Impôts (Niger) : "pour les biens appartenant à des personnes
-- morales et assimilées : 1% de la valeur définie à l'article précédent"
-- (valeur des immobilisations toutes taxes comprises avant amortissement, ou
-- à défaut le prix de revient). Sahel d'Or étant une SARL (personne morale),
-- ce taux est sans ambiguïté, contrairement aux 10%/5% de l'article 155 qui
-- ne s'appliquent qu'aux personnes physiques. Corrige l'estimation provisoire
-- (1,5%/5%/10%) qui figurait au point 44 du README avant vérification directe
-- dans le texte du CGI.
update public.companies
set taxe_immobiliere_rate = 1
where taxe_immobiliere_rate = 0;
