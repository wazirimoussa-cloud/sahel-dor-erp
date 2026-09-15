-- Corrige 2 autres écarts SYSCOHADA identifiés au point 93/94 (README) :
--
--   - 646 "Taxe professionnelle (patente)" -> 6412. 646 réel est "Droits d'enregistrement"
--     (confirmé sur 2 sources) ; la patente est 6412 "Patentes, licences et taxes annexes",
--     sous 641 "Impôts et taxes directs" -- même famille que 6411 (taxe immobilière,
--     0092). Compte seedé par 0030_is_taxe_professionnelle_structure.sql mais jamais
--     référencé par une RPC (aucune écriture automatique) : simple renommage.
--
--   - 21 "Immobilisations" (générique) -> 24 "Matériel, Mobilier et Actifs biologiques".
--     SYSCOHADA réserve 21 aux immobilisations INCORPORELLES uniquement -- les actifs
--     physiques que fixed_assets suit (camions, équipements... catégorie en texte libre,
--     voir 0036) relèvent de 23 (bâtiments) ou 24 (matériel/mobilier). Choix confirmé avec
--     l'utilisateur : un seul compte générique 24 plutôt qu'une répartition par catégorie
--     (23 pour un bâtiment/entrepôt resterait imparfaitement classé si jamais saisi --
--     limite assumée, `category` en texte libre ne permet pas un routage fiable). Aucune
--     donnée réelle n'existe dans fixed_assets à ce jour (vérifié sur Formation et
--     Production) : renommage sans aucun risque, create_fixed_asset/dispose_fixed_asset
--     redéfinies avec le nouveau code.

update public.chart_of_accounts
  set code = '6412', name = 'Patentes, licences et taxes annexes'
  where code = '646' and name = 'Taxe professionnelle (patente)';

update public.chart_of_accounts
  set code = '24', name = 'Matériel, Mobilier et Actifs biologiques'
  where code = '21' and name = 'Immobilisations';

-- create_fixed_asset : copie verbatim de 0069_amortissement_degressif.sql, seul le code du
-- compte d'immobilisation change (21 -> 24).
create or replace function public.create_fixed_asset(
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
  v_account_24 uuid;
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

  select id into v_account_24 from public.chart_of_accounts where company_id = v_company and code = '24';
  select id into v_account_521 from public.chart_of_accounts where company_id = v_company and code = '521';

  if v_account_24 is null or v_account_521 is null then
    raise exception 'Plan comptable incomplet pour cette société (comptes 24/521 requis)';
  end if;

  insert into public.journal_entries (company_id, journal_code, description)
  values (v_company, 'IMMOBILISATIONS', 'Acquisition ' || p_name)
  returning id into v_entry_id;

  insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
  values (v_entry_id, v_account_24, p_acquisition_cost, 0);

  insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
  values (v_entry_id, v_account_521, 0, p_acquisition_cost);

  return v_asset;
end;
$$;

-- dispose_fixed_asset : copie verbatim de 0069_amortissement_degressif.sql, seul le code
-- du compte d'immobilisation change (21 -> 24).
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
  v_account_24 uuid;
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

  v_months := (extract(year from p_disposal_date)::int - extract(year from v_asset.acquisition_date)::int) * 12
    + (extract(month from p_disposal_date)::int - extract(month from v_asset.acquisition_date)::int)
    - (case when extract(day from p_disposal_date)::int < extract(day from v_asset.acquisition_date)::int
            then 1 else 0 end);
  v_months := greatest(0, v_months);

  if v_asset.depreciation_method = 'degressif' then
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

  select id into v_account_24 from public.chart_of_accounts where company_id = v_company and code = '24';
  select id into v_account_28 from public.chart_of_accounts where company_id = v_company and code = '28';
  select id into v_account_675 from public.chart_of_accounts where company_id = v_company and code = '675';
  select id into v_account_521 from public.chart_of_accounts where company_id = v_company and code = '521';
  select id into v_account_775 from public.chart_of_accounts where company_id = v_company and code = '775';

  if v_account_24 is null or v_account_28 is null or v_account_675 is null
     or v_account_521 is null or v_account_775 is null then
    raise exception 'Plan comptable incomplet pour cette société (comptes 24/28/675/521/775 requis)';
  end if;

  insert into public.journal_entries (company_id, journal_code, description)
  values (v_company, 'IMMOBILISATIONS', 'Sortie ' || v_asset.name)
  returning id into v_entry_sortie;

  insert into public.journal_entry_lines (entry_id, account_id, debit, credit) values
    (v_entry_sortie, v_account_28, v_amortissement_cumule, 0),
    (v_entry_sortie, v_account_675, v_vnc, 0),
    (v_entry_sortie, v_account_24, 0, v_asset.acquisition_cost);

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
