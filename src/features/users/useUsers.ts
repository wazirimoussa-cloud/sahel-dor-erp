import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { RoleName } from "@/lib/database.types";

export function useUsers() {
  return useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, email, created_at, must_change_password, roles(name), companies(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useCompanies() {
  return useQuery({
    queryKey: ["companies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });
}

export interface NewUser {
  email: string;
  role: RoleName;
  companyId: string;
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (user: NewUser) => {
      // Passe par l'Edge Function create-user (clé service_role côté serveur) : un
      // utilisateur normal ne peut jamais créer de compte Auth ni s'auto-assigner un
      // rôle directement via l'API REST (voir supabase/functions/create-user). Le mot
      // de passe est toujours celui par défaut, jamais choisi ici.
      const { data, error } = await supabase.functions.invoke<{ id: string; email: string }>(
        "create-user",
        {
          body: {
            email: user.email,
            role: user.role,
            companyId: user.companyId,
          },
        },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useResetPassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.functions.invoke("reset-password", {
        body: { userId },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}
