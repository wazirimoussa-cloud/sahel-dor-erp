-- Corrige une limite documentée depuis l'origine du module (0036_fixed_assets.sql) :
-- la cession d'une immobilisation ne générait jusqu'ici aucune écriture -- disposal_date
-- retirait simplement l'actif du bilan (via netBookValueAsOf côté client), sans jamais
-- constater le solde entre le prix de cession et la valeur nette comptable (VNC).
--
-- Structure SYSCOHADA standard, en deux écritures séparées (trg_check_journal_entry_balance
-- exige que chaque journal_entries s'équilibre seule) :
--   1. Sortie du bien (toujours postée) : débit 28 (amortissement cumulé) + débit 675
--      (VCEAC = VNC) = crédit 21 (coût d'acquisition total) -- solde entièrement le 21
--      pour cet actif.
--   2. Encaissement (omis si prix de cession nul -- mise au rebut) : débit 521 (Banque
--      d'opération, même hypothèse comptant que create_fixed_asset à l'achat) = crédit 775.
--
-- Le compte 28 n'est mouvementé qu'ICI, jamais par une dotation périodique -- l'amortissement
-- reste calculé à la demande côté client (useFixedAssets.ts), philosophie inchangée depuis
-- 0036. Décision confirmée avec l'utilisateur (alternative "pas de compte 28" écartée : le
-- compte 21 resterait indéfiniment pollué par un résidu d'amortissement cumulé mélangé aux
-- actifs encore actifs).

insert into public.chart_of_accounts (company_id, code, name)
select c.id, a.code, a.name
from public.companies c
cross join (
  values
    ('28', 'Amortissements des immobilisations'),
    ('675', 'Valeurs comptables des cessions d''immobilisations'),
    ('775', 'Produits des cessions d''immobilisations')
) as a(code, name)
on conflict (company_id, code) do nothing;

-- Signature étendue (nouveau paramètre obligatoire p_disposal_price) : aucune compatibilité
-- ascendante à préserver, aucune cession réelle n'existe en Production/Formation à ce jour.
drop function if exists public.dispose_fixed_asset(uuid, date);

create function public.dispose_fixed_asset(
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

  -- Amortissement linéaire recalculé ici, en reproduisant exactement la formule de
  -- monthsBetween/accumulatedDepreciationAsOf (src/features/financials/useFixedAssets.ts) :
  -- on ne fait jamais confiance à un montant envoyé par le client pour un chiffre qui doit
  -- équilibrer une écriture comptable. Si cette formule change côté client, la reproduire
  -- aussi ici (aucun code partagé possible entre TS et PL/pgSQL).
  v_months := (extract(year from p_disposal_date)::int - extract(year from v_asset.acquisition_date)::int) * 12
    + (extract(month from p_disposal_date)::int - extract(month from v_asset.acquisition_date)::int)
    - (case when extract(day from p_disposal_date)::int < extract(day from v_asset.acquisition_date)::int
            then 1 else 0 end);
  v_months := greatest(0, least(v_months, v_asset.useful_life_years * 12));

  v_amortissement_cumule := v_asset.acquisition_cost * v_months / (v_asset.useful_life_years * 12);
  v_vnc := v_asset.acquisition_cost - v_amortissement_cumule;

  select id into v_account_21 from public.chart_of_accounts where company_id = v_company and code = '21';
  select id into v_account_28 from public.chart_of_accounts where company_id = v_company and code = '28';
  select id into v_account_675 from public.chart_of_accounts where company_id = v_company and code = '675';
  select id into v_account_521 from public.chart_of_accounts where company_id = v_company and code = '521';
  select id into v_account_775 from public.chart_of_accounts where company_id = v_company and code = '775';

  if v_account_21 is null or v_account_28 is null or v_account_675 is null
     or v_account_521 is null or v_account_775 is null then
    raise exception 'Plan comptable incomplet pour cette société (comptes 21/28/675/521/775 requis)';
  end if;

  -- Écriture 1 : sortie du bien -- toujours postée, même en mise au rebut à prix nul.
  insert into public.journal_entries (company_id, journal_code, description)
  values (v_company, 'IMMOBILISATIONS', 'Sortie ' || v_asset.name)
  returning id into v_entry_sortie;

  insert into public.journal_entry_lines (entry_id, account_id, debit, credit) values
    (v_entry_sortie, v_account_28, v_amortissement_cumule, 0),
    (v_entry_sortie, v_account_675, v_vnc, 0),
    (v_entry_sortie, v_account_21, 0, v_asset.acquisition_cost);

  -- Écriture 2 : encaissement du prix de cession -- omise si mise au rebut (prix nul),
  -- pas d'écriture sans substance économique.
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

grant execute on function public.dispose_fixed_asset(uuid, date, numeric) to authenticated;
