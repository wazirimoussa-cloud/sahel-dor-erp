import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/auth/useAuth";
import { useCreateClient } from "@/features/clients/useClients";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const clientSchema = z.object({
  name: z.string().min(1, "Nom requis"),
  contactName: z.string().optional(),
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
        <label className="mb-1 block text-xs font-medium text-gray-600">Nom</label>
        <Input {...register("name")} />
        {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">Contact</label>
        <Input {...register("contactName")} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">Téléphone</label>
        <Input {...register("phone")} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">Email</label>
        <Input type="email" {...register("email")} />
        {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">Adresse</label>
        <Input {...register("address")} />
      </div>
      <Button type="submit" disabled={isSubmitting}>
        Ajouter le client
      </Button>
    </form>
  );
}
