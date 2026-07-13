import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useProducts } from "@/features/products/useProducts";
import { useSuppliers } from "@/features/suppliers/useSuppliers";
import { useWarehouses } from "@/features/warehouses/useWarehouses";
import { useCreatePurchase } from "@/features/purchases/usePurchases";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const purchaseSchema = z.object({
  supplierId: z.string().uuid("Choisissez un fournisseur"),
  warehouseId: z.string().uuid("Choisissez un magasin"),
  items: z
    .array(
      z.object({
        productId: z.string().uuid("Choisissez un produit"),
        quantity: z.coerce.number().positive("La quantité doit être positive"),
      }),
    )
    .min(1, "Ajoutez au moins une ligne"),
});

type PurchaseFormValues = z.infer<typeof purchaseSchema>;

export function NewPurchaseForm({ onCreated }: { onCreated?: () => void }) {
  const { data: products } = useProducts();
  const { data: suppliers } = useSuppliers();
  const { data: warehouses } = useWarehouses();
  const createPurchase = useCreatePurchase();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PurchaseFormValues>({
    resolver: zodResolver(purchaseSchema),
    defaultValues: { items: [{ productId: "", quantity: 1 }] },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  async function onSubmit(values: PurchaseFormValues) {
    setServerError(null);
    try {
      await createPurchase.mutateAsync({
        supplierId: values.supplierId,
        warehouseId: values.warehouseId,
        items: values.items,
      });
      reset({
        supplierId: values.supplierId,
        warehouseId: values.warehouseId,
        items: [{ productId: "", quantity: 1 }],
      });
      onCreated?.();
    } catch {
      setServerError("Achat refusé (fournisseur/magasin/produit invalide, ou rôle non autorisé).");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
      <div className="flex flex-wrap gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Fournisseur</label>
          <select
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            {...register("supplierId")}
          >
            <option value="">— Choisir —</option>
            {suppliers?.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
          {errors.supplierId && (
            <p className="mt-1 text-xs text-red-600">{errors.supplierId.message}</p>
          )}
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
      </div>

      {fields.map((field, index) => (
        <div key={field.id} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Produit</label>
            <select
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              {...register(`items.${index}.productId` as const)}
            >
              <option value="">— Choisir —</option>
              {products?.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} ({product.unit})
                </option>
              ))}
            </select>
            {errors.items?.[index]?.productId && (
              <p className="mt-1 text-xs text-red-600">{errors.items[index]?.productId?.message}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Quantité</label>
            <Input type="number" step="0.001" {...register(`items.${index}.quantity` as const)} />
          </div>

          <Button type="button" variant="secondary" onClick={() => remove(index)}>
            Retirer
          </Button>
        </div>
      ))}

      {errors.items?.root && <p className="text-xs text-red-600">{errors.items.root.message}</p>}

      <div className="flex gap-3">
        <Button
          type="button"
          variant="secondary"
          onClick={() => append({ productId: "", quantity: 1 })}
        >
          + Ajouter une ligne
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          Créer l'achat
        </Button>
      </div>

      {serverError && <p className="text-sm text-red-600">{serverError}</p>}
    </form>
  );
}
