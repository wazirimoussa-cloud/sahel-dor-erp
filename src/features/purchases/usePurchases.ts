import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { rangeFor, splitPage } from "@/lib/usePagination";

export interface PurchaseItemInput {
  productId: string;
  quantity: number;
  unitCost?: number;
}

// prioritizePending trie les "en attente" en tête (page Réceptions du magasinier) : status
// est un enum Postgres déclaré pending/received/cancelled (0005_purchases.sql), donc un tri
// ascendant sur cette colonne place naturellement pending avant received/cancelled, sans
// CASE ni tri côté client -- created_at reste le tri secondaire au sein d'un même statut.
export function usePurchases(page: number, pageSize: number, prioritizePending = false) {
  return useQuery({
    queryKey: ["purchases", page, pageSize, prioritizePending],
    queryFn: async () => {
      let query = supabase
        .from("purchases")
        .select(
          "id, status, created_at, suppliers(name), warehouses(name), companies(vat_rate, vat_reduced_rate), purchase_items(quantity, unit_cost, products(vat_exempt, vat_reduced))",
        );
      if (prioritizePending) {
        query = query.order("status", { ascending: true });
      }
      const { data, error } = await query
        .order("created_at", { ascending: false })
        .range(...rangeFor(page, pageSize));
      if (error) throw error;
      return splitPage(data, pageSize);
    },
  });
}

export function usePurchase(purchaseId: string | undefined) {
  return useQuery({
    queryKey: ["purchases", purchaseId],
    enabled: Boolean(purchaseId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchases")
        .select(
          "id, status, created_at, received_at, receipt_number, driver_name, truck_plate, driver_phone, repackage_count, observation, user_id, users(email), suppliers(name, address), warehouses(name), companies(vat_rate, vat_reduced_rate), purchase_items(id, quantity, unit_cost, products(id, name, unit, vat_exempt, vat_reduced, unit_cost))",
        )
        .eq("id", purchaseId as string)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useCreatePurchase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      supplierId: string;
      warehouseId: string;
      items: PurchaseItemInput[];
    }) => {
      const { error } = await supabase.rpc("create_purchase", {
        payload: {
          supplier_id: params.supplierId,
          warehouse_id: params.warehouseId,
          items: params.items.map((item) => ({
            product_id: item.productId,
            quantity: item.quantity,
            unit_cost: item.unitCost,
          })),
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["purchases"] });
    },
  });
}

export interface ReceivePurchaseLossInput {
  productId: string;
  // Saisie libre (pas un id) : receive_purchase() réutilise un transporteur existant pour
  // cette société si le nom correspond (insensible à la casse/espaces), sinon en crée un
  // nouveau à la volée -- retire la dépendance à l'écran Transporteurs pour ce cas d'usage.
  transporterName: string;
  quantityLost: number;
  reason?: string;
}

export interface ReceivePurchaseLotExpiryInput {
  productId: string;
  expiryDate?: string;
}

export function useReceivePurchase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      purchaseId: string;
      losses: ReceivePurchaseLossInput[];
      lotExpiryDates?: ReceivePurchaseLotExpiryInput[];
      driverName: string;
      truckPlate: string;
      driverPhone: string;
      repackageCount?: number;
      observation?: string;
    }) => {
      const { error } = await supabase.rpc("receive_purchase", {
        purchase_id: params.purchaseId,
        losses: params.losses.map((loss) => ({
          product_id: loss.productId,
          transporter_name: loss.transporterName,
          quantity_lost: loss.quantityLost,
          reason: loss.reason || null,
        })),
        lot_expiry_dates: (params.lotExpiryDates ?? [])
          .filter((lot) => lot.expiryDate)
          .map((lot) => ({ product_id: lot.productId, expiry_date: lot.expiryDate })),
        p_driver_name: params.driverName,
        p_truck_plate: params.truckPlate,
        p_driver_phone: params.driverPhone,
        p_repackage_count: params.repackageCount,
        p_observation: params.observation || undefined,
      });
      if (error) throw error;
    },
    onSuccess: (_data, params) => {
      void queryClient.invalidateQueries({ queryKey: ["purchases"] });
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["purchase_losses", params.purchaseId] });
      void queryClient.invalidateQueries({ queryKey: ["purchase_losses"] });
      void queryClient.invalidateQueries({ queryKey: ["stock_lots"] });
      // Un nouveau transporteur a pu être créé côté serveur (saisie libre, auto-création).
      void queryClient.invalidateQueries({ queryKey: ["transporters"] });
    },
  });
}

export function usePurchaseLosses(purchaseId: string | undefined) {
  return useQuery({
    queryKey: ["purchase_losses", purchaseId],
    enabled: Boolean(purchaseId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_losses")
        .select(
          "id, quantity_lost, unit_cost, reason, created_at, products(name, unit), transporters(id, name)",
        )
        .eq("purchase_id", purchaseId as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useAllPurchaseLosses() {
  return useQuery({
    queryKey: ["purchase_losses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_losses")
        .select(
          "id, quantity_lost, unit_cost, reason, created_at, purchase_id, products(name, unit), transporters(id, name)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

// purchase_losses est en append-only (0020) : le montant recouvré n'y est jamais stocké,
// toujours recalculé depuis la somme des lignes purchase_loss_recoveries (elles-mêmes
// append-only, 0089/0090) — même principe que orders.amount_paid, mais purchase_losses ne
// peut pas être mis à jour en place comme orders. Une seule requête (RLS scope déjà à la
// société via purchase_losses -> purchases) ramène tous les recouvrements de la société ;
// regroupés côté client par purchase_loss_id.
export function useAllPurchaseLossRecoveredTotals() {
  return useQuery({
    queryKey: ["purchase_loss_recoveries", "totals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_loss_recoveries")
        .select("purchase_loss_id, amount");
      if (error) throw error;
      const totals = new Map<string, number>();
      for (const row of data) {
        totals.set(row.purchase_loss_id, (totals.get(row.purchase_loss_id) ?? 0) + row.amount);
      }
      return totals;
    },
  });
}

// Historique append-only des recouvrements d'une perte donnée — affiché au clic sur une
// ligne (une perte peut avoir plusieurs recouvrements partiels).
export function usePurchaseLossRecoveries(lossId: string | undefined) {
  return useQuery({
    queryKey: ["purchase_loss_recoveries", lossId],
    enabled: Boolean(lossId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_loss_recoveries")
        .select("id, amount, created_at, users(email)")
        .eq("purchase_loss_id", lossId as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

// record_purchase_loss_recovery (0089/0090) : débite trésorerie (521)/crédite l'avoir à
// recevoir (4098) — symétrique au record_payment des encaissements clients.
export function useRecordPurchaseLossRecovery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { lossId: string; amount: number }) => {
      const { error } = await supabase.rpc("record_purchase_loss_recovery", {
        p_loss_id: params.lossId,
        p_amount: params.amount,
      });
      if (error) throw error;
    },
    onSuccess: (_data, params) => {
      void queryClient.invalidateQueries({ queryKey: ["purchase_loss_recoveries", "totals"] });
      void queryClient.invalidateQueries({ queryKey: ["purchase_loss_recoveries", params.lossId] });
    },
  });
}

export function useCancelPurchase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (purchaseId: string) => {
      const { error } = await supabase.rpc("cancel_purchase", { purchase_id: purchaseId });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["purchases"] });
    },
  });
}
