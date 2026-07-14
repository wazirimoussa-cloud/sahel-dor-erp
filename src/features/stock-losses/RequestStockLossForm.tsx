import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useProducts } from "@/features/products/useProducts";
import { useWarehouses } from "@/features/warehouses/useWarehouses";
import { useRequestStockLoss } from "@/features/stock-losses/useStockLossRequests";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const schema = z
  .object({
    productId: z.string().uuid("Choisissez un produit"),
    warehouseId: z.string().uuid("Choisissez un magasin"),
    quantity: z.coerce.number().positive("La quantité doit être positive"),
    isRepackaging: z.boolean(),
    repackagedQuantity: z.coerce.number().optional(),
    reason: z.string().min(3, "Précisez un motif"),
  })
  .refine(
    (values) =>
      !values.isRepackaging ||
      (values.repackagedQuantity !== undefined && values.repackagedQuantity < values.quantity),
    {
      message: "La quantité reconditionnée doit être inférieure à la quantité de départ",
      path: ["repackagedQuantity"],
    },
  );

type FormValues = z.infer<typeof schema>;

export function RequestStockLossForm() {
  const { data: products } = useProducts();
  const { data: warehouses } = useWarehouses();
  const requestLoss = useRequestStockLoss();
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { isRepackaging: false },
  });

  const isRepackaging = watch("isRepackaging");

  async function onSubmit(values: FormValues) {
    setServerError(null);
    setSuccessMessage(null);
    try {
      await requestLoss.mutateAsync({
        productId: values.productId,
        warehouseId: values.warehouseId,
        quantity: values.quantity,
        reason: values.reason,
        repackagedQuantity: values.isRepackaging ? values.repackagedQuantity : undefined,
      });
      reset({ isRepackaging: false });
      setSuccessMessage("Demande envoyée — en attente de validation par le Contrôleur.");
    } catch {
      setServerError("Demande refusée (rôle non autorisé, ou produit/magasin invalide).");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="flex flex-wrap gap-3">
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
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Quantité concernée
          </label>
          <Input type="number" step="0.001" {...register("quantity")} />
          {errors.quantity && <p className="mt-1 text-xs text-red-600">{errors.quantity.message}</p>}
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" {...register("isRepackaging")} />
        Reconditionnement (une partie est récupérée dans un nouvel emballage)
      </label>

      {isRepackaging && (
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Quantité récupérée après reconditionnement
          </label>
          <Input type="number" step="0.001" {...register("repackagedQuantity")} />
          {errors.repackagedQuantity && (
            <p className="mt-1 text-xs text-red-600">{errors.repackagedQuantity.message}</p>
          )}
        </div>
      )}

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">Motif</label>
        <Input
          type="text"
          placeholder="Ex : sac déchiré à la manutention"
          {...register("reason")}
        />
        {errors.reason && <p className="mt-1 text-xs text-red-600">{errors.reason.message}</p>}
      </div>

      <Button type="submit" disabled={isSubmitting}>
        Déclarer la perte
      </Button>

      {successMessage && <p className="text-sm text-green-700">{successMessage}</p>}
      {serverError && <p className="text-sm text-red-600">{serverError}</p>}
    </form>
  );
}
