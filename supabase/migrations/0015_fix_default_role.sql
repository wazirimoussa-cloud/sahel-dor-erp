-- Corrige un bug introduit par 0014 : handle_new_user() cherchait encore le rôle par
-- défaut via l'ancien slug 'seller' (renommé 'sales' en 0014). Le lookup retournait
-- NULL, violant la contrainte not null sur users.role_id et faisant échouer TOUTE
-- création de compte (auth.users insert entièrement annulé par Postgres suite à
-- l'échec du trigger AFTER INSERT).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_default_role_id smallint;
begin
  select id into v_default_role_id from public.roles where name = 'sales';

  insert into public.users (id, email, role_id)
  values (new.id, new.email, v_default_role_id);

  return new;
end;
$$;
