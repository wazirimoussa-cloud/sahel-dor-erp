import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/auth/useAuth";
import { useCreateClient } from "@/features/clients/useClients";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const clientSchema = z.object({
  name: z.string().min(1, "Nom requis"),
  phone: z.string().optional(),
  email: z.string().email("Email invalide").optional().or(z.literal("")),
  address: z.string().optional(),
});

type ClientFormValues = z.infer<typeof clientSchema>;

export function ClientForm({ onCreated }: { onCreated?: () => void }) {
  const { profile } = useAuth();
  const createClient = useCreateClient();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ClientFormValues>({ resolver: zodResolver(clientSchema) });

  async function onSubmit(values: ClientFormValues) {
    if (!profile?.companyId) return;
    await createClient.mutateAsync({ ...values, companyId: profile.companyId });
    reset();
    onCreated?.();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-wrap items-end gap-3" noValidate>
      <div>
        <label htmlFor="client-name" className="mb-1 block text-xs font-medium text-gray-600">
          Nom
        </label>
        <Input id="client-name" {...register("name")} />
        {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
      </div>
      <div>
        <label htmlFor="client-phone" className="mb-1 block text-xs font-medium text-gray-600">
          Téléphone
        </label>
        <Input id="client-phone" {...register("phone")} />
      </div>
      <div>
        <label htmlFor="client-email" className="mb-1 block text-xs font-medium text-gray-600">
          Email
        </label>
        <Input id="client-email" type="email" {...register("email")} />
        {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
      </div>
      <div>
        <label htmlFor="client-address" className="mb-1 block text-xs font-medium text-gray-600">
          Adresse
        </label>
        <Input id="client-address" {...register("address")} />
      </div>
      <Button type="submit" disabled={isSubmitting}>
        Ajouter le client
      </Button>
    </form>
  );
}
