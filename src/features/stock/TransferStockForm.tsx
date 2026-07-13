import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useProducts } from "@/features/products/useProducts";
import { useWarehouses } from "@/features/warehouses/useWarehouses";
import { useTransferStock } from "@/features/stock/useTransactions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const transferSchema = z
  .object({
    productId: z.string().uuid("Choisissez un produit"),
    fromWarehouseId: z.string().uuid("Choisissez un magasin source"),
    toWarehouseId: z.string().uuid("Choisissez un magasin destination"),
    quantity: z.coerce.number().positive("La quantité doit être positive"),
  })
  .refine((values) => values.fromWarehouseId !== values.toWarehouseId, {
    message: "Le magasin source et le magasin destination doivent être différents",
    path: ["toWarehouseId"],
  });

type TransferFormValues = z.infer<typeof transferSchema>;

export function TransferStockForm() {
  const { data: products } = useProducts();
  const { data: warehouses } = useWarehouses();
  const transferStock = useTransferStock();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TransferFormValues>({ resolver: zodResolver(transferSchema) });

  async function onSubmit(values: TransferFormValues) {
    setServerError(null);
    try {
      await transferStock.mutateAsync({
        productId: values.productId,
        fromWarehouseId: values.fromWarehouseId,
        toWarehouseId: values.toWarehouseId,
        quantity: values.quantity,
      });
      reset();
    } catch {
      setServerError("Transfert refusé (stock insuffisant au magasin source).");
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
              {product.name} ({product.unit})
            </option>
          ))}
        </select>
        {errors.productId && (
          <p className="mt-1 text-xs text-red-600">{errors.productId.message}</p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">Magasin source</label>
        <select
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          {...register("fromWarehouseId")}
        >
          <option value="">— Choisir —</option>
          {warehouses?.map((warehouse) => (
            <option key={warehouse.id} value={warehouse.id}>
              {warehouse.name}
            </option>
          ))}
        </select>
        {errors.fromWarehouseId && (
          <p className="mt-1 text-xs text-red-600">{errors.fromWarehouseId.message}</p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">Magasin destination</label>
        <select
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          {...register("toWarehouseId")}
        >
          <option value="">— Choisir —</option>
          {warehouses?.map((warehouse) => (
            <option key={warehouse.id} value={warehouse.id}>
              {warehouse.name}
            </option>
          ))}
        </select>
        {errors.toWarehouseId && (
          <p className="mt-1 text-xs text-red-600">{errors.toWarehouseId.message}</p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">Quantité</label>
        <Input type="number" step="0.001" {...register("quantity")} />
        {errors.quantity && <p className="mt-1 text-xs text-red-600">{errors.quantity.message}</p>}
      </div>

      {serverError && <p className="w-full text-xs text-red-600">{serverError}</p>}

      <Button type="submit" disabled={isSubmitting}>
        Transférer
      </Button>
    </form>
  );
}
