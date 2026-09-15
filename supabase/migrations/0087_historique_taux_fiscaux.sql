-- Historique des changements de taux/montants fiscaux (VatSettingsPage). Jusqu'ici
-- useUpdateFiscalRates écrasait silencieusement les 17 champs fiscaux de `companies` via un
-- simple update() — aucune trace de qui a changé quoi ni quand, alors que ces taux pilotent
-- tous les calculs fiscaux futurs de la société et sont régulièrement revus. Même philosophie
-- que product_price_history (0024) : table append-only + RPC qui insère une ligne d'historique
-- par champ réellement modifié avant d'écraser.

create table public.fiscal_rate_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  field_name text not null,
  old_value numeric(14, 4) not null,
  new_value numeric(14, 4) not null,
  user_id uuid not null references public.users (id),
  created_at timestamptz not null default now()
);

create index fiscal_rate_history_company_id_idx on public.fiscal_rate_history (company_id);

alter table public.fiscal_rate_history enable row level security;

-- Append-only, comme transactions/logs/order_payments/purchase_losses/product_price_history.
create trigger trg_fiscal_rate_history_immutable
  before update or delete on public.fiscal_rate_history
  for each row execute function public.fn_block_mutation();

-- Lecture large scopée société (tout utilisateur voyant la page des paramètres fiscaux peut
-- voir qui a changé quoi, même sans droit de modification), écriture uniquement par la RPC
-- ci-dessous (aucune policy insert).
create policy fiscal_rate_history_select on public.fiscal_rate_history
  for select to authenticated
  using (public.current_role_name() = 'admin' or company_id = public.current_company_id());

-- Même autorisation que l'écran (comptabilite.modifier_capital_social, déjà utilisé par
-- VatSettingsPage.tsx pour gater le formulaire). N'insère une ligne d'historique que pour les
-- champs qui changent réellement (évite du bruit si le formulaire est soumis sans
-- modification) — même règle que update_product_price.
create or replace function public.update_fiscal_rates(
  p_company_id uuid,
  p_vat_rate numeric,
  p_impot_societes_rate numeric,
  p_precompte_isb_rate numeric,
  p_taxe_immobiliere_rate numeric,
  p_taxe_professionnelle_droit_fixe_pour_mille numeric,
  p_taxe_professionnelle_plancher numeric,
  p_taxe_professionnelle_droit_proportionnel_rate numeric,
  p_taxe_professionnelle_ca_annuel numeric,
  p_taxe_professionnelle_valeur_locative numeric,
  p_irvm_dividendes_rate numeric,
  p_irvm_plus_values_cession_rate numeric,
  p_irvm_obligations_rate numeric,
  p_droits_enregistrement_actes_societe numeric,
  p_droits_enregistrement_fonds_commerce_rate numeric,
  p_taxe_publicite_panneau_papier_rate numeric,
  p_taxe_publicite_panneau_autre_rate numeric,
  p_redevance_domaine_public_rate numeric
)
returns public.companies
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_caller_company uuid := public.current_company_id();
  v_company public.companies;
  v_user_id uuid := auth.uid();
begin
  if not public.has_attribution('comptabilite.modifier_capital_social') then
    raise exception 'Non autorisé à modifier les taux fiscaux';
  end if;

  select * into v_company from public.companies c where c.id = p_company_id;

  if v_company is null or v_company.id <> v_caller_company then
    raise exception 'Société introuvable';
  end if;

  insert into public.fiscal_rate_history (company_id, field_name, old_value, new_value, user_id)
  select v_company.id, t.field_name, t.old_value, t.new_value, v_user_id
  from (values
    ('vat_rate', v_company.vat_rate, p_vat_rate),
    ('impot_societes_rate', v_company.impot_societes_rate, p_impot_societes_rate),
    ('precompte_isb_rate', v_company.precompte_isb_rate, p_precompte_isb_rate),
    ('taxe_immobiliere_rate', v_company.taxe_immobiliere_rate, p_taxe_immobiliere_rate),
    ('taxe_professionnelle_droit_fixe_pour_mille', v_company.taxe_professionnelle_droit_fixe_pour_mille, p_taxe_professionnelle_droit_fixe_pour_mille),
    ('taxe_professionnelle_plancher', v_company.taxe_professionnelle_plancher, p_taxe_professionnelle_plancher),
    ('taxe_professionnelle_droit_proportionnel_rate', v_company.taxe_professionnelle_droit_proportionnel_rate, p_taxe_professionnelle_droit_proportionnel_rate),
    ('taxe_professionnelle_ca_annuel', v_company.taxe_professionnelle_ca_annuel, p_taxe_professionnelle_ca_annuel),
    ('taxe_professionnelle_valeur_locative', v_company.taxe_professionnelle_valeur_locative, p_taxe_professionnelle_valeur_locative),
    ('irvm_dividendes_rate', v_company.irvm_dividendes_rate, p_irvm_dividendes_rate),
    ('irvm_plus_values_cession_rate', v_company.irvm_plus_values_cession_rate, p_irvm_plus_values_cession_rate),
    ('irvm_obligations_rate', v_company.irvm_obligations_rate, p_irvm_obligations_rate),
    ('droits_enregistrement_actes_societe', v_company.droits_enregistrement_actes_societe, p_droits_enregistrement_actes_societe),
    ('droits_enregistrement_fonds_commerce_rate', v_company.droits_enregistrement_fonds_commerce_rate, p_droits_enregistrement_fonds_commerce_rate),
    ('taxe_publicite_panneau_papier_rate', v_company.taxe_publicite_panneau_papier_rate, p_taxe_publicite_panneau_papier_rate),
    ('taxe_publicite_panneau_autre_rate', v_company.taxe_publicite_panneau_autre_rate, p_taxe_publicite_panneau_autre_rate),
    ('redevance_domaine_public_rate', v_company.redevance_domaine_public_rate, p_redevance_domaine_public_rate)
  ) as t(field_name, old_value, new_value)
  where t.old_value <> t.new_value;

  update public.companies set
    vat_rate = p_vat_rate,
    impot_societes_rate = p_impot_societes_rate,
    precompte_isb_rate = p_precompte_isb_rate,
    taxe_immobiliere_rate = p_taxe_immobiliere_rate,
    taxe_professionnelle_droit_fixe_pour_mille = p_taxe_professionnelle_droit_fixe_pour_mille,
    taxe_professionnelle_plancher = p_taxe_professionnelle_plancher,
    taxe_professionnelle_droit_proportionnel_rate = p_taxe_professionnelle_droit_proportionnel_rate,
    taxe_professionnelle_ca_annuel = p_taxe_professionnelle_ca_annuel,
    taxe_professionnelle_valeur_locative = p_taxe_professionnelle_valeur_locative,
    irvm_dividendes_rate = p_irvm_dividendes_rate,
    irvm_plus_values_cession_rate = p_irvm_plus_values_cession_rate,
    irvm_obligations_rate = p_irvm_obligations_rate,
    droits_enregistrement_actes_societe = p_droits_enregistrement_actes_societe,
    droits_enregistrement_fonds_commerce_rate = p_droits_enregistrement_fonds_commerce_rate,
    taxe_publicite_panneau_papier_rate = p_taxe_publicite_panneau_papier_rate,
    taxe_publicite_panneau_autre_rate = p_taxe_publicite_panneau_autre_rate,
    redevance_domaine_public_rate = p_redevance_domaine_public_rate
  where id = p_company_id
  returning * into v_company;

  return v_company;
end;
$$;

grant execute on function public.update_fiscal_rates(
  uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric
) to authenticated;
