-- Revue de sécurité/fiabilité : set_user_attributions ne protégeait pas contre le
-- verrouillage total -- rien n'empêchait de retirer l'attribution utilisateurs.gerer au
-- dernier profil qui la détient (soi-même y compris), ce qui aurait rendu impossible
-- toute gestion future des comptes/attributions sans intervention directe en base.
--
-- Le calcul est volontairement global (toutes sociétés confondues), cohérent avec le
-- fait que set_user_attributions elle-même n'est plus scopée par société depuis 0034 --
-- l'admin réel gère déjà les utilisateurs de Production ET Formation indifféremment.

create or replace function public.set_user_attributions(p_user_id uuid, p_attributions jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_keeps_user_management boolean;
  v_other_holders_count integer;
begin
  if not public.has_attribution('utilisateurs.gerer') then
    raise exception 'Non autorisé à gérer les attributions des profils';
  end if;

  if not exists (select 1 from public.users where id = p_user_id) then
    raise exception 'Profil introuvable';
  end if;

  select exists (
    select 1 from jsonb_array_elements(coalesce(p_attributions, '[]'::jsonb)) e
    where e ->> 'action_key' = 'utilisateurs.gerer' and e ->> 'level' = 'operationnelle'
  ) into v_keeps_user_management;

  if not v_keeps_user_management then
    select count(*) into v_other_holders_count
    from public.user_attributions ua
    join public.attributions a on a.id = ua.attribution_id
    where a.action_key = 'utilisateurs.gerer' and ua.level = 'operationnelle' and ua.user_id <> p_user_id;

    if v_other_holders_count = 0 then
      raise exception 'Impossible de retirer cette attribution : au moins un profil doit toujours pouvoir gérer les utilisateurs';
    end if;
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
