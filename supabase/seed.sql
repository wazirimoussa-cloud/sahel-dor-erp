-- Données de référence + société de démonstration.
-- Volontairement PAS d'insertion directe dans auth.users ici (schéma interne à Supabase,
-- fragile d'une version à l'autre) : créez le premier compte admin via le Dashboard
-- (Authentication > Add user) ou l'écran de connexion, puis exécutez la requête de
-- promotion donnée dans le README.

insert into public.roles (name) values
  ('admin'),
  ('manager'),
  ('seller'),
  ('auditor')
on conflict (name) do nothing;

insert into public.companies (id, name) values
  ('00000000-0000-0000-0000-000000000001', 'Sahel d''Or — Société de démonstration')
on conflict (id) do nothing;
