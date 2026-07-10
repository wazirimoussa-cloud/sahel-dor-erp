import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export function useUpdateCapitalSocial() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      companyId,
      capitalSocial,
    }: {
      companyId: string;
      capitalSocial: number;
    }) => {
      const { error } = await supabase
        .from("companies")
        .update({ capital_social: capitalSocial })
        .eq("id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["financial_statements"] });
    },
  });
}
