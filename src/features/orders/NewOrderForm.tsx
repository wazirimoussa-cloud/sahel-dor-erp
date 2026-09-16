import { useState } from "react";
import { Controller, useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useActiveProducts } from "@/features/products/useProducts";
import { useActiveWarehouses, useWarehouseStock } from "@/features/warehouses/useWarehouses";
import { useActiveClients } from "@/features/clients/useClients";
import { useCreateOrder } from "@/features/orders/useOrders";
import { Button } from "@/components/ui/Button";
import { AmountInput } from "@/components/ui/AmountInput";

const orderSchema = z.object({
  warehouseId: z.string().uuid("Choisissez un magasin"),
  clientId: z.string().uuid("Choisissez un client"),
  items: z
    .array(
      z.object({
        productId: z.string().uuid("Choisissez un produit"),
        quantity: z.coerce.number().positive("La quantité doit être positive"),
      }),
    )
    .min(1, "Ajoutez au moins une ligne"),
});

type OrderFormValues = z.infer<typeof orderSchema>;

export function NewOrderForm({ onCreated }: { onCreated?: () => void }) {
  const { data: products } = useActiveProducts();
  const { data: warehouses } = useActiveWarehouses();
  const { data: clients } = useActiveClients();
  const createOrder = useCreateOrder();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<OrderFormValues>({
    resolver: zodResolver(orderSchema),
    defaultValues: { items: [{ productId: "", quantity: 1 }] },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  const warehouseId = watch("warehouseId");
  const { data: warehouseStock, isLoading: isLoadingWarehouseStock } = useWarehouseStock(
    warehouseId || undefined,
  );
  const stockByProduct = new Map((warehouseStock ?? []).map((row) => [row.product_id, row.stock]));

  async function onSubmit(values: OrderFormValues) {
    setServerError(null);

    // Vérification côté appli, à l'émission du bon de commande, avant toute tentative de
    // validation : product_stocks_stock_check ne bloque qu'à la validation (sortie de
    // stock réelle), trop tard pour prévenir — un vendeur ne découvrait le problème que si
    // et quand un superviseur validait, avec un message opaque. Ici on compare directement
    // au stock du magasin choisi (pas products.stock, un total global qui peut être non nul
    // alors que ce magasin précis est vide).
    if (warehouseId && isLoadingWarehouseStock) {
      setServerError("Chargement du stock de ce magasin en cours — réessayez dans un instant.");
      return;
    }

    let hasShortage = false;
    values.items.forEach((item, index) => {
      const available = stockByProduct.get(item.productId) ?? 0;
      if (item.quantity > available) {
        hasShortage = true;
        setError(`items.${index}.quantity`, {
          type: "manual",
          message: `Stock insuffisant à ce magasin (disponible : ${available})`,
        });
      }
    });
    if (hasShortage) {
      setServerError("Quantité(s) supérieure(s) au stock disponible dans ce magasin — voir le détail ci-dessous.");
      return;
    }

    try {
      await createOrder.mutateAsync({
        warehouseId: values.warehouseId,
        clientId: values.clientId,
        items: values.items,
      });
      reset({ warehouseId: values.warehouseId, clientId: values.clientId, items: [{ productId: "", quantity: 1 }] });
      onCreated?.();
    } catch {
      setServerError("Bon de commande refusé (stock insuffisant, produit/magasin/client invalide, ou rôle non autorisé).");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
      <div className="flex flex-wrap gap-3">
        <div>
          <label htmlFor="order-clientId" className="mb-1 block text-xs font-medium text-gray-600">
            Client
          </label>
          <select
            id="order-clientId"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            {...register("clientId")}
          >
            <option value="">— Choisir —</option>
            {clients?.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
          {errors.clientId && <p className="mt-1 text-xs text-red-600">{errors.clientId.message}</p>}
        </div>

        <div>
          <label htmlFor="order-warehouseId" className="mb-1 block text-xs font-medium text-gray-600">
            Magasin
          </label>
          <select
            id="order-warehouseId"
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
            <label
              htmlFor={`order-items-${index}-productId`}
              className="mb-1 block text-xs font-medium text-gray-600"
            >
              Produit
            </label>
            <select
              id={`order-items-${index}-productId`}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              {...register(`items.${index}.productId` as const)}
            >
              <option value="">— Choisir —</option>
              {products?.map((product) => {
                const stockLabel = warehouseId
                  ? `stock à ce magasin : ${stockByProduct.get(product.id) ?? 0}`
                  : `stock total : ${product.stock}`;
                return (
                  <option key={product.id} value={product.id}>
                    {product.name} ({stockLabel} {product.unit})
                  </option>
                );
              })}
            </select>
            {errors.items?.[index]?.productId && (
              <p className="mt-1 text-xs text-red-600">{errors.items[index]?.productId?.message}</p>
            )}
          </div>

          <div>
            <label
              htmlFor={`order-items-${index}-quantity`}
              className="mb-1 block text-xs font-medium text-gray-600"
            >
              Quantité
            </label>
            <Controller
              control={control}
              name={`items.${index}.quantity` as const}
              render={({ field }) => (
                <AmountInput
                  id={`order-items-${index}-quantity`}
                  allowDecimals
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                />
              )}
            />
            {errors.items?.[index]?.quantity && (
              <p className="mt-1 text-xs text-red-600">{errors.items[index]?.quantity?.message}</p>
            )}
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
          Créer le bon de commande
        </Button>
      </div>

      {serverError && (
        <p role="alert" className="text-sm text-red-600">
          {serverError}
        </p>
      )}
    </form>
  );
}
