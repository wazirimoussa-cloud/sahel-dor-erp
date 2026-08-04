import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import { rangeFor, splitPage } from "@/lib/usePagination";

export type LeaveType = Database["public"]["Enums"]["leave_type"];

export interface NewLeaveRecord {
  companyId: string;
  userId: string;
  employeeId: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  reason?: string;
}

export function useLeaveRecords(page: number, pageSize: number) {
  return useQuery({
    queryKey: ["leave_records", page, pageSize],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_records")
        .select("id, type, start_date, end_date, reason, employees(full_name)")
        .order("start_date", { ascending: false })
        .range(...rangeFor(page, pageSize));
      if (error) throw error;
      return splitPage(data, pageSize);
    },
  });
}

export function useCreateLeaveRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (record: NewLeaveRecord) => {
      const { error } = await supabase.from("leave_records").insert({
        company_id: record.companyId,
        employee_id: record.employeeId,
        type: record.type,
        start_date: record.startDate,
        end_date: record.endDate,
        reason: record.reason || null,
        user_id: record.userId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["leave_records"] });
    },
  });
}

export function useDeleteLeaveRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("leave_records").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["leave_records"] });
    },
  });
}
