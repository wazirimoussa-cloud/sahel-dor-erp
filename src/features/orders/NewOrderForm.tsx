import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useProducts } from "@/features/products/useProducts";
import { useCreateOrder } from "@/features/orders/useOrders";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const orderSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid("Choisissez un produit"),
        quantity: z.coerce.number().int().min(1, "Quantité minimale : 1"),
      }),
    )
    .min(1, "Ajoutez au moins une ligne"),
});

type OrderFormValues = z.infer<typeof orderSchema>;

export function NewOrderForm({ onCreated }: { onCreated?: () => void }) {
  const { data: products } = useProducts();
  const createOrder = useCreateOrder();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<OrderFormValues>({
    resolver: zodResolver(orderSchema),
    defaultValues: { items: [{ productId: "", quantity: 1 }] },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  async function onSubmit(values: OrderFormValues) {
    setServerError(null);
    try {
      await createOrder.mutateAsync(values.items);
      reset({ items: [{ productId: "", quantity: 1 }] });
      onCreated?.();
    } catch {
      setServerError("Commande refusée (stock insuffisant, produit invalide, ou rôle non autorisé).");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
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
                  {product.name} (stock : {product.stock})
                </option>
              ))}
            </select>
            {errors.items?.[index]?.productId && (
              <p className="mt-1 text-xs text-red-600">{errors.items[index]?.productId?.message}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Quantité</label>
            <Input type="number" {...register(`items.${index}.quantity` as const)} />
          </div>

          <Button type="button" variant="secondary" onClick={() => remove(index)}>
            Retirer
          </Button>
        </div>
      ))}

      {errors.items?.root && <p className="text-xs text-red-600">{errors.items.root.message}</p>}

      <div className="flex gap-3">
        <Button type="button" variant="secondary" onClick={() => append({ productId: "", quantity: 1 })}>
          + Ajouter une ligne
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          Créer la commande
        </Button>
      </div>

      {serverError && <p className="text-sm text-red-600">{serverError}</p>}
    </form>
  );
}
