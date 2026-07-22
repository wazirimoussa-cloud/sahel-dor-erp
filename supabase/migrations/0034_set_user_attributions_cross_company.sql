-- Correction de 0032 : set_user_attributions restreignait la gestion des attributions à
-- des profils de la MÊME société que l'appelant. Or la gestion des utilisateurs
-- (création via create-user, réinitialisation via reset-password) n'a jamais eu cette
-- restriction -- l'admin (seul titulaire de utilisateurs.gerer aujourd'hui) gère déjà
-- les comptes de Production ET Formation indifféremment, les deux Edge Functions
-- utilisant la clé service_role sans aucun scoping société. set_user_attributions doit
-- suivre la même logique : seule l'attribution utilisateurs.gerer conditionne l'accès,
-- pas la société du profil ciblé.

-- Même correction pour la lecture : qui gère les utilisateurs doit voir les attributions
-- actuelles d'un profil de n'importe quelle société pour pouvoir les modifier
-- (UserAttributionsPanel), pas seulement celles de sa propre société.
drop policy user_attributions_select on public.user_attributions;
create policy user_attributions_select on public.user_attributions
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.has_attribution('utilisateurs.gerer')
  );

create or replace function public.set_user_attributions(p_user_id uuid, p_attributions jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
begin
  if not public.has_attribution('utilisateurs.gerer') then
    raise exception 'Non autorisé à gérer les attributions des profils';
  end if;

  if not exists (select 1 from public.users where id = p_user_id) then
    raise exception 'Profil introuvable';
  end if;

  delete from public.user_attributions where user_id = p_user_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_attributions, '[]'::jsonb))
  loop
    insert into public.user_attributions (user_id, attribution_id, level, granted_by)
    select p_user_id, a.id, v_item ->> 'level', auth.uid()
    from public.attributions a
    where a.action_key = v_item ->> 'action_key';
  end loop;
end;
$$;
