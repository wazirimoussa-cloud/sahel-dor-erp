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
// période qui chevauche une cession).
function accumulatedDepreciationAsOf(asset: FixedAssetRow, asOfIso: string): number {
  if (asOfIso < asset.acquisition_date) return 0;
  const effectiveDate =
    asset.disposal_date && asset.disposal_date < asOfIso ? asset.disposal_date : asOfIso;
  const totalMonths = asset.useful_life_years * 12;
  const elapsedMonths = Math.min(monthsBetween(asset.acquisition_date, effectiveDate), totalMonths);
  return (asset.acquisition_cost * elapsedMonths) / totalMonths;
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
        .select("id, name, category, acquisition_date, acquisition_cost, useful_life_years, disposal_date")
        .order("acquisition_date", { ascending: false });
      if (error) throw error;
      return data;
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
    }) => {
      const { error } = await supabase.rpc("create_fixed_asset", {
        p_name: params.name,
        p_category: params.category,
        p_acquisition_date: params.acquisitionDate,
        p_acquisition_cost: params.acquisitionCost,
        p_useful_life_years: params.usefulLifeYears,
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
    mutationFn: async (params: { assetId: string; disposalDate: string }) => {
      const { error } = await supabase.rpc("dispose_fixed_asset", {
        p_asset_id: params.assetId,
        p_disposal_date: params.disposalDate,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["fixed_assets"] });
      void queryClient.invalidateQueries({ queryKey: ["financial_statements"] });
    },
  });
}
