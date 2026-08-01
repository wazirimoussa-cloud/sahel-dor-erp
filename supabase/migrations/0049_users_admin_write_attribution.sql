-- La policy users_admin_write vérifiait encore le rôle littéral 'admin' (reliquat du
-- modèle de rôles fixes d'avant 0032_attributions.sql), jamais migré vers l'attribution
-- utilisateurs.gerer -- alors que role_id est null pour les 5 profils actifs du modèle
-- attributions-only actuel (voir README, "Limites connues", point sur la vue
-- cross-société de l'admin). Ça rendait la policy structurellement insatisfiable pour
-- tout compte réel, aucun appel client ne s'appuyait dessus jusqu'ici (les
-- réinitialisations de mot de passe passent par l'Edge Function reset-password, qui
-- utilise la clé service_role et contourne RLS) -- découvert en testant le nouveau
-- bouton Archiver/Réactiver (0048_archivage.sql), le premier appel direct
-- `from("users").update(...)` du code client.
drop policy if exists users_admin_write on public.users;

create policy users_admin_write on public.users
  for update
  using (has_attribution('utilisateurs.gerer'))
  with check (has_attribution('utilisateurs.gerer'));
