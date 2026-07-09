import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface NewAccount {
  companyId: string;
  code: string;
  name: string;
}

export function useChartOfAccounts() {
  return useQuery({
    queryKey: ["chart_of_accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chart_of_accounts")
        .select("id, code, name, company_id, created_at")
        .order("code", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (account: NewAccount) => {
      const { error } = await supabase.from("chart_of_accounts").insert({
        company_id: account.companyId,
        code: account.code,
        name: account.name,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["chart_of_accounts"] });
    },
  });
}
