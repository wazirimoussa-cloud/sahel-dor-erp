import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface FixedAssetRow {
  id: string;
  name: string;
  category: string;
  acquisition_date: string;
  acquisition_cost: number;
  useful_life_years: number;
  disposal_date: string | null;
  depreciation_method: "lineaire" | "degressif";
  degressif_coefficient: number | null;
}

// Amortissement linéaire, calculé à la demande (aucune écriture d'amortissement postée
// périodiquement) -- même philosophie que la valeur du stock (Phase 10) : recalculée à
// chaque consultation plutôt que maintenue par un job de clôture, cohérent avec l'absence
// totale d'exercice comptable dans l'app.
function monthsBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00`);
  const to = new Date(`${toIso}T00:00:00`);
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) months -= 1;
  return Math.max(0, months);
}

// Amortissements cumulés, figés à la date de cession si l'actif a été cédé (la
// dépréciation n'évolue plus au-delà -- utilisé aussi pour calculer la dotation d'une
// période qui chevauche une cession). Branche selon la méthode : linéaire inchangé depuis
// l'origine ; dégressif calculé en continu au prorata du temps écoulé (pas la mécanique
// SYSCOHADA stricte par exercice comptable avec bascule au linéaire -- décision actée,
// cohérente avec l'absence totale de notion d'exercice comptable/clôture dans l'app).
function accumulatedDepreciationAsOf(asset: FixedAssetRow, asOfIso: string): number {
  if (asOfIso < asset.acquisition_date) return 0;
  const effectiveDate =
    asset.disposal_date && asset.disposal_date < asOfIso ? asset.disposal_date : asOfIso;
  const elapsedMonths = monthsBetween(asset.acquisition_date, effectiveDate);

  if (asset.depreciation_method === "degressif") {
    // Coefficient saisi manuellement (pas de barème automatique par tranche de durée --
    // aucune source CGI Niger/SYSCOHADA vérifiée pour ce projet). Pas de plafond à
    // useful_life_years ici (contrairement au linéaire ci-dessous) : une décroissance
    // exponentielle continue est par nature asymptotique, la plafonner laisserait un
    // résidu figé pour toujours après la durée d'utilité.
    const linearRate = 1 / asset.useful_life_years;
    const coefficient = asset.degressif_coefficient ?? 0;
    // Clamp à 100% nécessaire, pas seulement défensif : sans lui, un coefficient × taux
    // linéaire > 1 rendrait (1 - taux) négatif, et Math.pow d'une base négative avec un
    // exposant fractionnaire renvoie NaN.
    const effectiveRate = Math.min(coefficient * linearRate, 1);
    const elapsedYears = elapsedMonths / 12;
    const netBookValue = asset.acquisition_cost * Math.pow(1 - effectiveRate, elapsedYears);
    return asset.acquisition_cost - netBookValue;
  }

  const totalMonths = asset.useful_life_years * 12;
  const cappedMonths = Math.min(elapsedMonths, totalMonths);
  return (asset.acquisition_cost * cappedMonths) / totalMonths;
}

// Valeur nette comptable à une date donnée -- 0 avant acquisition, 0 à partir de la date
// de cession (l'actif est retiré du bilan, pas figé à une valeur résiduelle).
export function netBookValueAsOf(asset: FixedAssetRow, asOfIso: string): number {
  if (asOfIso < asset.acquisition_date) return 0;
  if (asset.disposal_date && asOfIso >= asset.disposal_date) return 0;
  return asset.acquisition_cost - accumulatedDepreciationAsOf(asset, asOfIso);
}

// Dotation aux amortissements sur une période -- delta des amortissements cumulés,
// naturellement nul pour la partie de la période postérieure à une éventuelle cession.
export function depreciationForPeriod(asset: FixedAssetRow, startIso: string, endIso: string): number {
  return accumulatedDepreciationAsOf(asset, endIso) - accumulatedDepreciationAsOf(asset, startIso);
}

export function useFixedAssets() {
  return useQuery({
    queryKey: ["fixed_assets"],
    queryFn: async (): Promise<FixedAssetRow[]> => {
      const { data, error } = await supabase
        .from("fixed_assets")
        .select(
          "id, name, category, acquisition_date, acquisition_cost, useful_life_years, disposal_date, depreciation_method, degressif_coefficient",
        )
        .order("acquisition_date", { ascending: false });
      if (error) throw error;
      // depreciation_method est une colonne text+check (pas un enum Postgres), donc
      // supabase gen types la génère en string simple -- cast vers le littéral union.
      return data as FixedAssetRow[];
    },
  });
}

export function useCreateFixedAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      name: string;
      category: string;
      acquisitionDate: string;
      acquisitionCost: number;
      usefulLifeYears: number;
      depreciationMethod: "lineaire" | "degressif";
      degressifCoefficient: number | null;
    }) => {
      const { error } = await supabase.rpc("create_fixed_asset", {
        p_name: params.name,
        p_category: params.category,
        p_acquisition_date: params.acquisitionDate,
        p_acquisition_cost: params.acquisitionCost,
        p_useful_life_years: params.usefulLifeYears,
        p_depreciation_method: params.depreciationMethod,
        p_degressif_coefficient: params.degressifCoefficient ?? undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["fixed_assets"] });
      void queryClient.invalidateQueries({ queryKey: ["financial_statements"] });
    },
  });
}

export function useDisposeFixedAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { assetId: string; disposalDate: string; disposalPrice: number }) => {
      const { error } = await supabase.rpc("dispose_fixed_asset", {
        p_asset_id: params.assetId,
        p_disposal_date: params.disposalDate,
        p_disposal_price: params.disposalPrice,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["fixed_assets"] });
      void queryClient.invalidateQueries({ queryKey: ["financial_statements"] });
    },
  });
}
