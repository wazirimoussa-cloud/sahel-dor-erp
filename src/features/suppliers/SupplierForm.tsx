import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/auth/useAuth";
import { useCreateSupplier } from "@/features/suppliers/useSuppliers";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const supplierSchema = z.object({
  name: z.string().min(1, "Nom requis"),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Email invalide").optional().or(z.literal("")),
  address: z.string().optional(),
});

type SupplierFormValues = z.infer<typeof supplierSchema>;

export function SupplierForm({ onCreated }: { onCreated?: () => void }) {
  const { profile } = useAuth();
  const createSupplier = useCreateSupplier();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SupplierFormValues>({ resolver: zodResolver(supplierSchema) });

  async function onSubmit(values: SupplierFormValues) {
    if (!profile?.companyId) return;
    await createSupplier.mutateAsync({ ...values, companyId: profile.companyId });
    reset();
    onCreated?.();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-wrap items-end gap-3" noValidate>
      <div>
        <label htmlFor="supplier-name" className="mb-1 block text-xs font-medium text-gray-600">
          Nom
        </label>
        <Input id="supplier-name" {...register("name")} />
        {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
      </div>
      <div>
        <label htmlFor="supplier-contactName" className="mb-1 block text-xs font-medium text-gray-600">
          Contact
        </label>
        <Input id="supplier-contactName" {...register("contactName")} />
      </div>
      <div>
        <label htmlFor="supplier-phone" className="mb-1 block text-xs font-medium text-gray-600">
          Téléphone
        </label>
        <Input id="supplier-phone" {...register("phone")} />
      </div>
      <div>
        <label htmlFor="supplier-email" className="mb-1 block text-xs font-medium text-gray-600">
          Email
        </label>
        <Input id="supplier-email" type="email" {...register("email")} />
        {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
      </div>
      <div>
        <label htmlFor="supplier-address" className="mb-1 block text-xs font-medium text-gray-600">
          Adresse
        </label>
        <Input id="supplier-address" {...register("address")} />
      </div>
      <Button type="submit" disabled={isSubmitting}>
        Ajouter le fournisseur
      </Button>
    </form>
  );
}
