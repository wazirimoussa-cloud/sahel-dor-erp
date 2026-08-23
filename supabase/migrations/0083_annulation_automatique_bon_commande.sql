-- Annulation automatique des bons de commande non validés après 48 heures ouvrées
-- (lundi-samedi, 8h-18h, dimanche exclu, heure d'Afrique de l'Ouest -- Africa/Lagos, UTC+1
-- fixe sans DST, utilisé comme proxy Niamey/Lomé faute de colonne fuseau horaire sur
-- companies). orders n'a que created_at comme horodatage -- seul point de départ possible
-- pour ce calcul. cancel_order ne restaure plus le stock depuis
-- 0016_agribusiness_governance.sql (le stock ne part qu'à la validation) : cette tâche peut
-- donc se contenter d'un simple changement de statut, sans réversion de stock ni écriture
-- comptable.

create or replace function public.fn_business_hours_elapsed(p_since timestamptz)
returns numeric
language plpgsql
stable
as $$
declare
  v_zone constant text := 'Africa/Lagos';
  v_start timestamp := p_since at time zone v_zone;
  v_end timestamp := now() at time zone v_zone;
  v_day date;
  v_overlap_start timestamp;
  v_overlap_end timestamp;
  v_total numeric := 0;
  v_iterations integer := 0;
begin
  if p_since is null or v_end <= v_start then
    return 0;
  end if;

  v_day := v_start::date;

  while v_day <= v_end::date loop
    v_iterations := v_iterations + 1;
    exit when v_iterations > 60; -- garde-fou anti-boucle infinie, très large marge

    if extract(isodow from v_day) between 1 and 6 then -- 1=lundi..6=samedi, 7=dimanche exclu
      v_overlap_start := greatest(v_day + time '08:00', v_start);
      v_overlap_end   := least(v_day + time '18:00', v_end);
      if v_overlap_end > v_overlap_start then
        v_total := v_total + extract(epoch from (v_overlap_end - v_overlap_start)) / 3600.0;
      end if;
    end if;

    v_day := v_day + 1;
  end loop;

  return v_total;
end;
$$;

-- Tâche système, pas d'attribution ni de current_company_id() : contrairement aux RPC
-- existantes (invoquées par un utilisateur, scopées à une société), celle-ci n'a pas de
-- contexte auth.uid() et doit couvrir toutes les sociétés en un seul passage. Le trigger
-- générique trg_audit_orders (0002_functions_triggers.sql) se déclenche déjà sur cet UPDATE
-- et écrit dans logs avec user_id = null -- pas de journalisation applicative à ajouter.
create or replace function public.fn_auto_cancel_stale_orders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with cancelled as (
    update public.orders
    set status = 'cancelled'
    where status = 'pending'
      and public.fn_business_hours_elapsed(created_at) >= 48
    returning id
  )
  select count(*) into v_count from cancelled;

  return v_count;
end;
$$;

-- Postgres accorde EXECUTE à PUBLIC par défaut à la création : sans ce revoke, n'importe
-- quel utilisateur connecté pourrait appeler cette fonction depuis le navigateur et annuler
-- en masse les commandes de toutes les sociétés. Même motif que
-- reset_formation_data/reenable_immutable_triggers (0073_reset_formation_data.sql).
revoke all on function public.fn_business_hours_elapsed(timestamptz) from public, anon, authenticated;
revoke all on function public.fn_auto_cancel_stale_orders() from public, anon, authenticated;

create extension if not exists pg_cron with schema extensions;

select cron.schedule(
  'auto-cancel-stale-orders',
  '0 * * * *',
  $$select public.fn_auto_cancel_stale_orders();$$
);
