-- Revue de sécurité : erp_data était une table ouverte à tout client anonyme (policy
-- "Allow all for anon", GRANT complets à anon/authenticated), présente dans le projet
-- Supabase depuis avant l'historique des migrations de cette application (probablement
-- un reliquat de configuration initiale) -- confirmée non référencée nulle part dans le
-- code de l'app ni dans aucune migration. Supprimée.
drop table if exists public.erp_data;
