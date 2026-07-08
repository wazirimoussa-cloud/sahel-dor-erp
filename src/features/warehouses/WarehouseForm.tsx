import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/auth/useAuth";
import { useCreateWarehouse } from "@/features/warehouses/useWarehouses";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const warehouseSchema = z.object({
  name: z.string().min(1, "Nom requis"),
  location: z.string().optional(),
});

type WarehouseFormValues = z.infer<typeof warehouseSchema>;

export function WarehouseForm({ onCreated }: { onCreated?: () => void }) {
  const { profile } = useAuth();
  const createWarehouse = useCreateWarehouse();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<WarehouseFormValues>({ resolver: zodResolver(warehouseSchema) });

  async function onSubmit(values: WarehouseFormValues) {
    if (!profile?.companyId) return;
    await createWarehouse.mutateAsync({ ...values, companyId: profile.companyId });
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
        <label className="mb-1 block text-xs font-medium text-gray-600">Emplacement</label>
        <Input {...register("location")} placeholder="Ville, quartier…" />
      </div>
      <Button type="submit" disabled={isSubmitting}>
        Ajouter le magasin
      </Button>
    </form>
  );
}
