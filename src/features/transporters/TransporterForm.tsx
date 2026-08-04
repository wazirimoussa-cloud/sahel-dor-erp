import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/auth/useAuth";
import { useCreateTransporter } from "@/features/transporters/useTransporters";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const transporterSchema = z.object({
  name: z.string().min(1, "Nom requis"),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Email invalide").optional().or(z.literal("")),
  address: z.string().optional(),
});

type TransporterFormValues = z.infer<typeof transporterSchema>;

export function TransporterForm({ onCreated }: { onCreated?: () => void }) {
  const { profile } = useAuth();
  const createTransporter = useCreateTransporter();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TransporterFormValues>({ resolver: zodResolver(transporterSchema) });

  async function onSubmit(values: TransporterFormValues) {
    if (!profile?.companyId) return;
    await createTransporter.mutateAsync({ ...values, companyId: profile.companyId });
    reset();
    onCreated?.();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-wrap items-end gap-3" noValidate>
      <div>
        <label htmlFor="transporter-name" className="mb-1 block text-xs font-medium text-gray-600">
          Nom
        </label>
        <Input id="transporter-name" {...register("name")} />
        {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
      </div>
      <div>
        <label htmlFor="transporter-contactName" className="mb-1 block text-xs font-medium text-gray-600">
          Contact
        </label>
        <Input id="transporter-contactName" {...register("contactName")} />
      </div>
      <div>
        <label htmlFor="transporter-phone" className="mb-1 block text-xs font-medium text-gray-600">
          Téléphone
        </label>
        <Input id="transporter-phone" {...register("phone")} />
      </div>
      <div>
        <label htmlFor="transporter-email" className="mb-1 block text-xs font-medium text-gray-600">
          Email
        </label>
        <Input id="transporter-email" type="email" {...register("email")} />
        {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
      </div>
      <div>
        <label htmlFor="transporter-address" className="mb-1 block text-xs font-medium text-gray-600">
          Adresse
        </label>
        <Input id="transporter-address" {...register("address")} />
      </div>
      <Button type="submit" disabled={isSubmitting}>
        Ajouter le transporteur
      </Button>
    </form>
  );
}
