import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { rangeFor, splitPage } from "@/lib/usePagination";

export interface NewEmployee {
  companyId: string;
  fullName: string;
  position?: string;
  baseSalary: number;
  familyDependents: number;
}

export function useEmployees(page: number, pageSize: number) {
  return useQuery({
    queryKey: ["employees", page, pageSize],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, full_name, position, base_salary, family_dependents, active, created_at")
        .order("full_name", { ascending: true })
        .range(...rangeFor(page, pageSize));
      if (error) throw error;
      return splitPage(data, pageSize);
    },
  });
}

export function useActiveEmployees() {
  return useQuery({
    queryKey: ["employees", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, full_name, base_salary")
        .eq("active", true)
        .order("full_name", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateEmployee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (employee: NewEmployee) => {
      const { error } = await supabase.from("employees").insert({
        company_id: employee.companyId,
        full_name: employee.fullName,
        position: employee.position || null,
        base_salary: employee.baseSalary,
        family_dependents: employee.familyDependents,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
  });
}

export function useSetEmployeeActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ employeeId, active }: { employeeId: string; active: boolean }) => {
      const { error } = await supabase.from("employees").update({ active }).eq("id", employeeId);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
  });
}
