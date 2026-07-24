-- Le prix de revient / valeur marchande du stock (Phase prix de revient, 0043) n'est
-- pas une information anodine : c'est une donnée sensible (coût réel, marge implicite)
-- que tout profil pouvant simplement consulter un achat ne devrait pas voir par
-- défaut. Nouvelle attribution dédiée, assignable/délégable comme les autres — un
-- profil ne la voit que si l'administrateur la lui accorde explicitement.

insert into public.attributions (module, action_key, label) values
  ('comptabilite', 'comptabilite.consulter_prix_revient', 'Consulter le prix de revient (valeur marchande) du stock');

-- Backfill : accordée au même niveau que la consultation des états financiers, qui
-- expose déjà une valeur agrégée du stock valorisé au bilan (même sensibilité) — évite
-- de retirer une visibilité que les profils déjà habilités à voir les états financiers
-- avaient de fait via le bilan.
insert into public.user_attributions (user_id, attribution_id, level)
select ua.user_id, a.id, ua.level
from public.user_attributions ua
join public.attributions existing on existing.id = ua.attribution_id
join public.attributions a on a.action_key = 'comptabilite.consulter_prix_revient'
where existing.action_key = 'etats_financiers.consulter'
on conflict (user_id, attribution_id) do nothing;
