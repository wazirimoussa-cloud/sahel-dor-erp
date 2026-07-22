import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { AttributionLevel } from "@/auth/AuthContext";

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
  companyId: string;
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (user: NewUser) => {
      // Passe par l'Edge Function create-user (clé service_role côté serveur) : un
      // utilisateur normal ne peut jamais créer de compte Auth directement via l'API
      // REST (voir supabase/functions/create-user). Le mot de passe est toujours celui
      // par défaut, jamais choisi ici. Aucune attribution n'est assignée à la création —
      // c'est une étape séparée (voir UserAttributionsPanel).
      const { data, error } = await supabase.functions.invoke<{ id: string; email: string }>(
        "create-user",
        {
          body: {
            email: user.email,
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

export interface AttributionDefinition {
  id: string;
  module: string;
  actionKey: string;
  label: string;
}

export function useAttributionsCatalog() {
  return useQuery({
    queryKey: ["attributions-catalog"],
    queryFn: async (): Promise<AttributionDefinition[]> => {
      const { data, error } = await supabase
        .from("attributions")
        .select("id, module, action_key, label")
        .order("module");
      if (error) throw error;
      return data.map((row) => ({
        id: row.id,
        module: row.module,
        actionKey: row.action_key,
        label: row.label,
      }));
    },
  });
}

export interface UserAttributionAssignment {
  attributionId: string;
  actionKey: string;
  level: AttributionLevel;
}

export function useUserAttributions(userId: string | null) {
  return useQuery({
    queryKey: ["user-attributions", userId],
    enabled: !!userId,
    queryFn: async (): Promise<UserAttributionAssignment[]> => {
      const { data, error } = await supabase
        .from("user_attributions")
        .select("level, attribution_id, attributions(action_key)")
        .eq("user_id", userId as string);
      if (error) throw error;
      return data.flatMap((row) => {
        const rel = row.attributions as { action_key: string } | { action_key: string }[] | null;
        const attr = Array.isArray(rel) ? rel[0] : rel;
        if (!attr) return [];
        return [{ attributionId: row.attribution_id, actionKey: attr.action_key, level: row.level as AttributionLevel }];
      });
    },
  });
}

export function useSetUserAttributions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      userId,
      assignments,
    }: {
      userId: string;
      assignments: { actionKey: string; level: AttributionLevel }[];
    }) => {
      const { error } = await supabase.rpc("set_user_attributions", {
        p_user_id: userId,
        p_attributions: assignments.map((a) => ({ action_key: a.actionKey, level: a.level })),
      });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["user-attributions", variables.userId] });
    },
  });
}
