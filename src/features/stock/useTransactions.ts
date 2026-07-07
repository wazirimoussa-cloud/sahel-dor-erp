import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { TransactionType } from "@/lib/database.types";

export interface NewTransaction {
  productId: string;
  type: TransactionType;
  quantity: number;
  userId: string;
}

export function useTransactions() {
  return useQuery({
    queryKey: ["transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, type, quantity, created_at, products(name)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (transaction: NewTransaction) => {
      const { error } = await supabase.from("transactions").insert({
        product_id: transaction.productId,
        type: transaction.type,
        quantity: transaction.quantity,
        user_id: transaction.userId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      // Le trigger fn_apply_transaction_stock met déjà à jour products.stock côté DB ;
      // on invalide les deux caches pour refléter le nouveau stock à l'écran.
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
}
