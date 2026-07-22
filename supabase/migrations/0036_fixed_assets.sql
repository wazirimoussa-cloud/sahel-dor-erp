-- Immobilisations et amortissements. Phase 10 avait explicitement exclu les
-- immobilisations du bilan ("aucune ligne Actif immobilisé", limite documentée) -- sans
-- elles, le bilan d'un grossiste possédant réellement des camions/entrepôts/équipements
-- est incomplet.
--
-- Dans la continuité directe de la Phase 10 (bilan/compte de résultat déjà calculés à la
-- demande, sans écriture de clôture, à partir du grand livre + d'une reconstruction
-- dynamique pour ce qui n'est pas posté -- exactement comme la valeur du stock) :
-- amortissement linéaire uniquement (dégressif hors périmètre), aucune écriture
-- d'amortissement postée périodiquement (amortissements cumulés/dotation recalculés à la
-- demande côté client, pas de job de clôture à maintenir), seule l'acquisition génère une
-- vraie écriture (impact trésorerie réel, hypothèse d'un paiement comptant -- limite
-- documentée), cession simplifiée (un champ disposal_date fige la valeur, sans
-- plus/moins-value calculée).

create table public.fixed_assets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  name text not null,
  category text not null,
  acquisition_date date not null,
  acquisition_cost numeric(14, 2) not null check (acquisition_cost > 0),
  useful_life_years numeric(4, 1) not null check (useful_life_years > 0),
  disposal_date date,
  user_id uuid not null references public.users (id),
  created_at timestamptz not null default now(),
  constraint disposal_date_after_acquisition check (disposal_date is null or disposal_date >= acquisition_date)
);

alter table public.fixed_assets enable row level security;

-- Lecture scopée société (comme le reste) ; aucune policy insert/update -- écriture
-- uniquement via les RPC ci-dessous.
create policy fixed_assets_select on public.fixed_assets
  for select to authenticated
  using (company_id = public.current_company_id());

-- Compte 21 (Immobilisations) pour chaque société existante -- seul compte réellement
-- posté (l'acquisition) ; pas de "28"/"681" créé puisqu'aucune écriture n'y est jamais
-- postée, même logique que l'absence d'un compte "Stock".
insert into public.chart_of_accounts (company_id, code, name)
select id, '21', 'Immobilisations' from public.companies
on conflict (company_id, code) do nothing;

-- Nouvelle attribution : gestion des immobilisations. Backfill : donnée en opérationnelle
-- à tout profil ayant déjà comptabilite.gerer_plan_comptable opérationnelle (même
-- titulaire logique -- le Comptable).
insert into public.attributions (module, action_key, label) values
  ('comptabilite', 'comptabilite.gerer_immobilisations', 'Créer/céder une immobilisation');

insert into public.user_attributions (user_id, attribution_id, level)
select ua.user_id, a.id, 'operationnelle'
from public.user_attributions ua
join public.attributions existing on existing.id = ua.attribution_id
join public.attributions a on a.action_key = 'comptabilite.gerer_immobilisations'
where existing.action_key = 'comptabilite.gerer_plan_comptable' and ua.level = 'operationnelle';

create function public.create_fixed_asset(
  p_name text,
  p_category text,
  p_acquisition_date date,
  p_acquisition_cost numeric,
  p_useful_life_years numeric
)
returns public.fixed_assets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_asset public.fixed_assets;
  v_account_21 uuid;
  v_account_521 uuid;
  v_entry_id uuid;
begin
  if not public.has_attribution('comptabilite.gerer_immobilisations') then
    raise exception 'Non autorisé à créer une immobilisation';
  end if;

  if v_company is null then
    raise exception 'Aucune société associée à cet utilisateur';
  end if;

  if trim(coalesce(p_name, '')) = '' then
    raise exception 'Un nom est requis';
  end if;

  if trim(coalesce(p_category, '')) = '' then
    raise exception 'Une catégorie est requise';
  end if;

  insert into public.fixed_assets (company_id, name, category, acquisition_date, acquisition_cost, useful_life_years, user_id)
  values (v_company, p_name, p_category, p_acquisition_date, p_acquisition_cost, p_useful_life_years, auth.uid())
  returning * into v_asset;

  select id into v_account_21 from public.chart_of_accounts where company_id = v_company and code = '21';
  select id into v_account_521 from public.chart_of_accounts where company_id = v_company and code = '521';

  if v_account_21 is null or v_account_521 is null then
    raise exception 'Plan comptable incomplet pour cette société (comptes 21/521 requis)';
  end if;

  insert into public.journal_entries (company_id, journal_code, description)
  values (v_company, 'IMMOBILISATIONS', 'Acquisition ' || p_name)
  returning id into v_entry_id;

  insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
  values (v_entry_id, v_account_21, p_acquisition_cost, 0);

  insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
  values (v_entry_id, v_account_521, 0, p_acquisition_cost);

  return v_asset;
end;
$$;

create function public.dispose_fixed_asset(p_asset_id uuid, p_disposal_date date)
returns public.fixed_assets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_asset public.fixed_assets;
begin
  if not public.has_attribution('comptabilite.gerer_immobilisations') then
    raise exception 'Non autorisé à céder une immobilisation';
  end if;

  select * into v_asset from public.fixed_assets
  where id = p_asset_id and company_id = v_company
  for update;

  if v_asset is null then
    raise exception 'Immobilisation introuvable pour cette société';
  end if;

  if v_asset.disposal_date is not null then
    raise exception 'Cette immobilisation a déjà été cédée';
  end if;

  if p_disposal_date < v_asset.acquisition_date then
    raise exception 'La date de cession ne peut pas précéder la date d''acquisition';
  end if;

  update public.fixed_assets set disposal_date = p_disposal_date
  where id = p_asset_id
  returning * into v_asset;

  return v_asset;
end;
$$;

grant execute on function public.create_fixed_asset(text, text, date, numeric, numeric) to authenticated;
grant execute on function public.dispose_fixed_asset(uuid, date) to authenticated;
