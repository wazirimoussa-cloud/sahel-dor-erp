import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface NewClient {
  companyId: string;
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
}

export function useClients() {
  return useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, contact_name, phone, email, address, company_id, created_at, active")
        .order("name", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

// Réservé aux listes de sélection pour une nouvelle commande : un client archivé reste
// visible dans /clients (via useClients) pour qu'on puisse le réactiver, mais ne doit
// plus pouvoir être choisi pour une nouvelle commande.
export function useActiveClients() {
  return useQuery({
    queryKey: ["clients", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name")
        .eq("active", true)
        .order("name", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (client: NewClient) => {
      const { error } = await supabase.from("clients").insert({
        company_id: client.companyId,
        name: client.name,
        contact_name: client.contactName || null,
        phone: client.phone || null,
        email: client.email || null,
        address: client.address || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

export function useSetClientActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ clientId, active }: { clientId: string; active: boolean }) => {
      const { error } = await supabase.from("clients").update({ active }).eq("id", clientId);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}
