-- Amortissement dégressif, en complément du linéaire (seule méthode jusqu'ici, 0036).
-- Coefficient saisi manuellement (pas de barème par tranche, aucune source vérifiée pour
-- ce projet). Calcul continu au prorata du temps écoulé (pas de bascule au linéaire par
-- exercice comptable -- l'app n'a aucune notion d'exercice/clôture, tout est recalculé à
-- la demande, même philosophie que 0036/0066). Formule :
--   VNC = coût × (1 − min(coefficient × 1/durée, 1)) ^ (mois écoulés / 12)
-- Pas de plafond à useful_life_years pour le dégressif (contrairement au linéaire) : une
-- décroissance exponentielle continue est par nature asymptotique -- la plafonner
-- laisserait un résidu figé pour toujours après la durée d'utilité, moins honnête que la
-- vraie asymptote qui tend vers 0 sans jamais l'atteindre.

alter table public.fixed_assets
  add column depreciation_method text not null default 'lineaire'
    check (depreciation_method in ('lineaire', 'degressif')),
  add column degressif_coefficient numeric(4, 2)
    check (degressif_coefficient is null or degressif_coefficient > 0);

-- Cohérence croisée entre les deux colonnes ci-dessus (les deux check colonne seuls ne
-- couvrent pas la combinaison) : un actif dégressif doit avoir un coefficient, un actif
-- linéaire ne doit jamais en avoir un -- évite une donnée ambiguë en base.
alter table public.fixed_assets
  add constraint fixed_assets_degressif_coefficient_consistency check (
    (depreciation_method = 'lineaire' and degressif_coefficient is null)
    or
    (depreciation_method = 'degressif' and degressif_coefficient is not null)
  );

-- Signature étendue (2 nouveaux paramètres) : drop puis create, même convention que
-- dispose_fixed_asset/request_stock_loss (0066/0067).
drop function if exists public.create_fixed_asset(text, text, date, numeric, numeric);

create function public.create_fixed_asset(
  p_name text,
  p_category text,
  p_acquisition_date date,
  p_acquisition_cost numeric,
  p_useful_life_years numeric,
  p_depreciation_method text default 'lineaire',
  p_degressif_coefficient numeric default null
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
  v_method text := coalesce(p_depreciation_method, 'lineaire');
  v_coefficient numeric;
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

  if v_method not in ('lineaire', 'degressif') then
    raise exception 'Méthode d''amortissement invalide (lineaire ou degressif attendu)';
  end if;

  -- Coefficient saisi manuellement (décision actée -- pas de barème automatique). On ne
  -- fait jamais confiance à une combinaison incohérente envoyée par le client :
  -- obligatoire et strictement positif en dégressif, toujours forcé à null en linéaire
  -- (même si le formulaire en enverrait un par erreur).
  if v_method = 'degressif' then
    if p_degressif_coefficient is null or p_degressif_coefficient <= 0 then
      raise exception 'Un coefficient dégressif positif est requis pour la méthode dégressif';
    end if;
    v_coefficient := p_degressif_coefficient;
  else
    v_coefficient := null;
  end if;

  insert into public.fixed_assets (
    company_id, name, category, acquisition_date, acquisition_cost, useful_life_years,
    depreciation_method, degressif_coefficient, user_id
  )
  values (
    v_company, p_name, p_category, p_acquisition_date, p_acquisition_cost, p_useful_life_years,
    v_method, v_coefficient, auth.uid()
  )
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

grant execute on function
  public.create_fixed_asset(text, text, date, numeric, numeric, text, numeric)
  to authenticated;

-- Signature inchangée (create or replace suffit). Branche sur la méthode pour le calcul
-- de l'amortissement cumulé/VNC recalculé côté serveur (jamais fourni par le client --
-- même philosophie que 0066). Correction d'arrondi au passage (les deux branches) :
-- journal_entry_lines.debit/credit sont numeric(14,2) et trg_check_journal_entry_balance
-- exige une égalité stricte de la somme par écriture -- arrondir indépendamment deux
-- valeurs calculées en pleine précision peut, dans un cas limite (frontière d'arrondi à
-- 0,5 centime), faire dévier leur somme de 0,01 FCFA. On arrondit désormais la VNC
-- directement, puis on dérive l'amortissement cumulé par soustraction exacte -- élimine
-- le risque par construction.
create or replace function public.dispose_fixed_asset(
  p_asset_id uuid,
  p_disposal_date date,
  p_disposal_price numeric
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
  v_account_28 uuid;
  v_account_675 uuid;
  v_account_521 uuid;
  v_account_775 uuid;
  v_entry_sortie uuid;
  v_entry_encaissement uuid;
  v_months numeric;
  v_linear_rate numeric;
  v_effective_rate numeric;
  v_elapsed_years numeric;
  v_amortissement_cumule numeric;
  v_vnc numeric;
begin
  if not public.has_attribution('comptabilite.gerer_immobilisations') then
    raise exception 'Non autorisé à céder une immobilisation';
  end if;

  if p_disposal_price is null or p_disposal_price < 0 then
    raise exception 'Le prix de cession doit être positif ou nul';
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

  -- Mois écoulés entre acquisition et cession -- reproduit exactement monthsBetween()
  -- (src/features/financials/useFixedAssets.ts).
  v_months := (extract(year from p_disposal_date)::int - extract(year from v_asset.acquisition_date)::int) * 12
    + (extract(month from p_disposal_date)::int - extract(month from v_asset.acquisition_date)::int)
    - (case when extract(day from p_disposal_date)::int < extract(day from v_asset.acquisition_date)::int
            then 1 else 0 end);
  v_months := greatest(0, v_months);

  if v_asset.depreciation_method = 'degressif' then
    -- Clamp à 100% nécessaire, pas juste défensif : sans lui, un coefficient × taux
    -- linéaire > 1 rendrait (1 - taux) négatif, et une puissance fractionnaire d'une base
    -- négative n'est pas définie.
    v_linear_rate := 1 / v_asset.useful_life_years;
    v_effective_rate := least(v_asset.degressif_coefficient * v_linear_rate, 1);
    v_elapsed_years := v_months / 12.0;
    v_vnc := round(v_asset.acquisition_cost * power(1 - v_effective_rate, v_elapsed_years), 2);
    v_amortissement_cumule := v_asset.acquisition_cost - v_vnc;
  else
    v_months := least(v_months, v_asset.useful_life_years * 12);
    v_amortissement_cumule := round(v_asset.acquisition_cost * v_months / (v_asset.useful_life_years * 12), 2);
    v_vnc := v_asset.acquisition_cost - v_amortissement_cumule;
  end if;

  select id into v_account_21 from public.chart_of_accounts where company_id = v_company and code = '21';
  select id into v_account_28 from public.chart_of_accounts where company_id = v_company and code = '28';
  select id into v_account_675 from public.chart_of_accounts where company_id = v_company and code = '675';
  select id into v_account_521 from public.chart_of_accounts where company_id = v_company and code = '521';
  select id into v_account_775 from public.chart_of_accounts where company_id = v_company and code = '775';

  if v_account_21 is null or v_account_28 is null or v_account_675 is null
     or v_account_521 is null or v_account_775 is null then
    raise exception 'Plan comptable incomplet pour cette société (comptes 21/28/675/521/775 requis)';
  end if;

  insert into public.journal_entries (company_id, journal_code, description)
  values (v_company, 'IMMOBILISATIONS', 'Sortie ' || v_asset.name)
  returning id into v_entry_sortie;

  insert into public.journal_entry_lines (entry_id, account_id, debit, credit) values
    (v_entry_sortie, v_account_28, v_amortissement_cumule, 0),
    (v_entry_sortie, v_account_675, v_vnc, 0),
    (v_entry_sortie, v_account_21, 0, v_asset.acquisition_cost);

  if p_disposal_price > 0 then
    insert into public.journal_entries (company_id, journal_code, description)
    values (v_company, 'IMMOBILISATIONS', 'Encaissement cession ' || v_asset.name)
    returning id into v_entry_encaissement;

    insert into public.journal_entry_lines (entry_id, account_id, debit, credit) values
      (v_entry_encaissement, v_account_521, p_disposal_price, 0),
      (v_entry_encaissement, v_account_775, 0, p_disposal_price);
  end if;

  update public.fixed_assets set disposal_date = p_disposal_date
  where id = p_asset_id
  returning * into v_asset;

  return v_asset;
end;
$$;
