-- Seed du taux de Précompte ISB à 2%, conformément à l'Article 40 du Code
-- Général des Impôts (Niger) : "2%, sur les opérations faites sur le marché
-- intérieur par des opérateurs économiques immatriculés" — le cas le plus
-- probable pour l'activité de Sahel d'Or (commerce de gros sur le marché
-- intérieur, pas d'opérations douanières/portuaires identifiées). L'article
-- prévoit aussi 4% (opérations portuaires/douanières, opérateur immatriculé)
-- et 7% (opérateur non immatriculé) — cette valeur par défaut de 2% est une
-- référence à ajuster manuellement au cas par cas via l'écran "Paramètres
-- fiscaux" si une opération relève d'un autre tarif.
update public.companies
set precompte_isb_rate = 2
where precompte_isb_rate = 0;
