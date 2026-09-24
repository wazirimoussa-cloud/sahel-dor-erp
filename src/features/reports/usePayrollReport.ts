import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface PayrollReportFilters {
  dateFrom?: string;
  dateTo?: string;
  employeeId?: string;
}

// Trois hooks, un par sous-tableau de la Paie (mêmes colonnes que usePayslips.ts/
// useSalaryAdvances.ts/useLeaveRecords.ts, non paginées, pour extraction) -- les hooks
// paginés existants, utilisés par PayePage.tsx, ne sont pas modifiés.

export function usePayslipsReport(filters: PayrollReportFilters) {
  return useQuery({
    queryKey: ["reports", "payslips", filters],
    queryFn: async () => {
      let query = supabase
        .from("payslips")
        .select(
          "id, period, employee_id, gross_salary, pension_withholding, its_withholding, net_pay, advance_repaid_id, employees(full_name, position)",
        );
      if (filters.dateFrom) query = query.gte("period", filters.dateFrom);
      if (filters.dateTo) query = query.lte("period", filters.dateTo);
      if (filters.employeeId) query = query.eq("employee_id", filters.employeeId);
      const { data, error } = await query.order("period", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useSalaryAdvancesReport(filters: PayrollReportFilters) {
  return useQuery({
    queryKey: ["reports", "salary_advances", filters],
    queryFn: async () => {
      let query = supabase
        .from("salary_advances")
        .select("id, employee_id, amount, advance_date, reason, employees(full_name), payslips(id)");
      if (filters.dateFrom) query = query.gte("advance_date", filters.dateFrom);
      if (filters.dateTo) query = query.lte("advance_date", filters.dateTo);
      if (filters.employeeId) query = query.eq("employee_id", filters.employeeId);
      const { data, error } = await query.order("advance_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useLeaveRecordsReport(filters: PayrollReportFilters) {
  return useQuery({
    queryKey: ["reports", "leave_records", filters],
    queryFn: async () => {
      let query = supabase
        .from("leave_records")
        .select("id, employee_id, type, start_date, end_date, reason, employees(full_name)");
      if (filters.dateFrom) query = query.gte("start_date", filters.dateFrom);
      if (filters.dateTo) query = query.lte("start_date", filters.dateTo);
      if (filters.employeeId) query = query.eq("employee_id", filters.employeeId);
      const { data, error } = await query.order("start_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}
