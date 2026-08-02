import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface NewPayslip {
  employeeId: string;
  period: string;
  grossSalary: number;
  pensionWithholding: number;
  itsWithholding: number;
  advanceRepaidId?: string;
}

export function usePayslips() {
  return useQuery({
    queryKey: ["payslips"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payslips")
        .select(
          "id, period, gross_salary, pension_withholding, its_withholding, net_pay, advance_repaid_id, created_at, employees(full_name)",
        )
        .order("period", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreatePayslip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payslip: NewPayslip) => {
      const { error } = await supabase.rpc("create_payslip", {
        payload: {
          employee_id: payslip.employeeId,
          period: `${payslip.period}-01`,
          gross_salary: payslip.grossSalary,
          pension_withholding: payslip.pensionWithholding,
          its_withholding: payslip.itsWithholding,
          advance_repaid_id: payslip.advanceRepaidId || null,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["payslips"] });
      void queryClient.invalidateQueries({ queryKey: ["salary_advances"] });
      void queryClient.invalidateQueries({ queryKey: ["journal_entries"] });
    },
  });
}
