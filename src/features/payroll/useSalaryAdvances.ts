import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface NewSalaryAdvance {
  employeeId: string;
  amount: number;
  reason?: string;
}

export function useSalaryAdvances() {
  return useQuery({
    queryKey: ["salary_advances"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salary_advances")
        .select("id, employee_id, amount, advance_date, reason, created_at, employees(full_name), payslips(id)")
        .order("advance_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

// Avances non remboursées pour un employé donné (aucun bulletin ne les référence
// encore) -- utilisé par le formulaire de bulletin pour proposer un remboursement.
export function useOutstandingAdvances(employeeId: string | undefined) {
  return useQuery({
    queryKey: ["salary_advances", "outstanding", employeeId],
    enabled: Boolean(employeeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salary_advances")
        .select("id, amount, advance_date, reason, payslips(id)")
        .eq("employee_id", employeeId as string)
        .order("advance_date", { ascending: true });
      if (error) throw error;
      return data.filter((advance) => {
        const repaidBy = advance.payslips;
        return Array.isArray(repaidBy) ? repaidBy.length === 0 : !repaidBy;
      });
    },
  });
}

export function useCreateSalaryAdvance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (advance: NewSalaryAdvance) => {
      const { error } = await supabase.rpc("create_salary_advance", {
        payload: {
          employee_id: advance.employeeId,
          amount: advance.amount,
          reason: advance.reason || null,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["salary_advances"] });
      void queryClient.invalidateQueries({ queryKey: ["journal_entries"] });
    },
  });
}
