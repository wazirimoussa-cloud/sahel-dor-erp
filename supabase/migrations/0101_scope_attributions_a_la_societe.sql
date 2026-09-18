-- Corrige une fuite inter-société trouvée par le nouveau test de régression RLS
-- (tests/unit/rlsAttributionScoping.test.ts, écrit pour détecter exactement ce motif :
-- une policy qui vérifie has_attribution(...) mais oublie de filtrer sur la société --
-- déjà arrivé 3 fois avant celle-ci, voir 0074_users_select_write_company_scope.sql et
-- le correctif équivalent entre 0050 et 0053 pour companies_admin_write).
--
-- Historique : 0034_set_user_attributions_cross_company.sql a RETIRÉ le filtre société
-- de user_attributions_select et de set_user_attributions() délibérément, en argumentant
-- qu'un seul admin gérait Production ET Formation indifféremment via les Edge Functions
-- service_role (create-user, reset-password -- qui contournent RLS de toute façon, donc
-- non affectées par ce correctif). Mais 0074, plus tard, a inversé cette posture pour
-- users_select/users_admin_write : chaque société n'est plus censée voir/gérer que ses
-- propres comptes -- users_select filtre déjà company_id depuis 0074, donc l'écran
-- Utilisateurs ne peut plus aujourd'hui exposer un p_user_id d'une autre société (aucun
-- changement de comportement UI attendu). user_attributions_select et
-- set_user_attributions() ont été oubliés lors de ce revirement : un compte avec
-- utilisateurs.gerer dans N'IMPORTE QUELLE société pouvait encore lire ET modifier les
-- attributions de n'importe quel utilisateur de n'importe quelle société, en appelant
-- l'API directement (hors UI).
--
-- user_attributions n'a pas de company_id propre (comme logs) -- jointure via users.

drop policy if exists user_attributions_select on public.user_attributions;
create policy user_attributions_select on public.user_attributions
  for select to authenticated
  using (
    user_id = auth.uid()
    or (
      public.has_attribution('utilisateurs.gerer')
      and exists (
        select 1 from public.users u
        where u.id = user_attributions.user_id and u.company_id = public.current_company_id()
      )
    )
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

  if not exists (
    select 1 from public.users where id = p_user_id and company_id = public.current_company_id()
  ) then
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
