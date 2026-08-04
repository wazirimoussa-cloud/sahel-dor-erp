import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { rangeFor, splitPage } from "@/lib/usePagination";

export interface NewAccount {
  companyId: string;
  code: string;
  name: string;
}

export function useChartOfAccounts(page: number, pageSize: number) {
  return useQuery({
    queryKey: ["chart_of_accounts", page, pageSize],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chart_of_accounts")
        .select("id, code, name, company_id, created_at")
        .order("code", { ascending: true })
        .range(...rangeFor(page, pageSize));
      if (error) throw error;
      return splitPage(data, pageSize);
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
