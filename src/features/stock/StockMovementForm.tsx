import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/auth/useAuth";
import { useProducts } from "@/features/products/useProducts";
import { useWarehouses } from "@/features/warehouses/useWarehouses";
import { useCreateTransaction } from "@/features/stock/useTransactions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const movementSchema = z.object({
  productId: z.string().uuid("Choisissez un produit"),
  warehouseId: z.string().uuid("Choisissez un magasin"),
  type: z.enum(["IN", "OUT", "ADJUSTMENT"]),
  quantity: z.coerce.number().int().refine((value) => value !== 0, "La quantité ne peut pas être 0"),
});

type MovementFormValues = z.infer<typeof movementSchema>;

export function StockMovementForm() {
  const { session } = useAuth();
  const { data: products } = useProducts();
  const { data: warehouses } = useWarehouses();
  const createTransaction = useCreateTransaction();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<MovementFormValues>({ resolver: zodResolver(movementSchema) });

  async function onSubmit(values: MovementFormValues) {
    if (!session) return;
    setServerError(null);
    try {
      await createTransaction.mutateAsync({
        productId: values.productId,
        warehouseId: values.warehouseId,
        type: values.type,
        quantity: values.type === "ADJUSTMENT" ? values.quantity : Math.abs(values.quantity),
        userId: session.user.id,
      });
      reset();
    } catch {
      setServerError("Mouvement refusé (stock insuffisant ou produit invalide).");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-wrap items-end gap-3" noValidate>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">Produit</label>
        <select
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          {...register("productId")}
        >
          <option value="">— Choisir —</option>
          {products?.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </select>
        {errors.productId && <p className="mt-1 text-xs text-red-600">{errors.productId.message}</p>}
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">Magasin</label>
        <select
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          {...register("warehouseId")}
        >
          <option value="">— Choisir —</option>
          {warehouses?.map((warehouse) => (
            <option key={warehouse.id} value={warehouse.id}>
              {warehouse.name}
            </option>
          ))}
        </select>
        {errors.warehouseId && (
          <p className="mt-1 text-xs text-red-600">{errors.warehouseId.message}</p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">Type</label>
        <select className="rounded-md border border-gray-300 px-3 py-2 text-sm" {...register("type")}>
          <option value="IN">Entrée</option>
          <option value="OUT">Sortie</option>
          <option value="ADJUSTMENT">Ajustement (± signé)</option>
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">Quantité</label>
        <Input type="number" {...register("quantity")} />
        {errors.quantity && <p className="mt-1 text-xs text-red-600">{errors.quantity.message}</p>}
      </div>

      {serverError && <p className="w-full text-xs text-red-600">{serverError}</p>}

      <Button type="submit" disabled={isSubmitting}>
        Enregistrer le mouvement
      </Button>
    </form>
  );
}
