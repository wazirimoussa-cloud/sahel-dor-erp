import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useProducts } from "@/features/products/useProducts";
import { useWarehouses } from "@/features/warehouses/useWarehouses";
import { useCreateTransformation } from "@/features/transformations/useTransformations";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const lineSchema = z.object({
  productId: z.string().uuid("Choisissez un produit"),
  quantity: z.coerce.number().positive("La quantité doit être positive"),
});

const transformationSchema = z.object({
  warehouseId: z.string().uuid("Choisissez un magasin"),
  inputs: z.array(lineSchema).min(1, "Ajoutez au moins un intrant"),
  outputs: z.array(lineSchema).min(1, "Ajoutez au moins un extrant"),
});

type TransformationFormValues = z.infer<typeof transformationSchema>;

export function NewTransformationForm({ onCreated }: { onCreated?: () => void }) {
  const { data: products } = useProducts();
  const { data: warehouses } = useWarehouses();
  const createTransformation = useCreateTransformation();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TransformationFormValues>({
    resolver: zodResolver(transformationSchema),
    defaultValues: {
      inputs: [{ productId: "", quantity: 1 }],
      outputs: [{ productId: "", quantity: 1 }],
    },
  });

  const inputsArray = useFieldArray({ control, name: "inputs" });
  const outputsArray = useFieldArray({ control, name: "outputs" });

  async function onSubmit(values: TransformationFormValues) {
    setServerError(null);
    try {
      await createTransformation.mutateAsync({
        warehouseId: values.warehouseId,
        inputs: values.inputs,
        outputs: values.outputs,
      });
      reset({
        warehouseId: values.warehouseId,
        inputs: [{ productId: "", quantity: 1 }],
        outputs: [{ productId: "", quantity: 1 }],
      });
      onCreated?.();
    } catch {
      setServerError(
        "Transformation refusée (stock insuffisant pour un intrant, produit/magasin invalide, ou rôle non autorisé).",
      );
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
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

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-gray-700">Intrants consommés</h3>
        {inputsArray.fields.map((field, index) => (
          <div key={field.id} className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Produit</label>
              <select
                className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                {...register(`inputs.${index}.productId` as const)}
              >
                <option value="">— Choisir —</option>
                {products?.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} ({product.unit})
                  </option>
                ))}
              </select>
              {errors.inputs?.[index]?.productId && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.inputs[index]?.productId?.message}
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Quantité</label>
              <Input type="number" step="0.001" {...register(`inputs.${index}.quantity` as const)} />
            </div>
            <Button type="button" variant="secondary" onClick={() => inputsArray.remove(index)}>
              Retirer
            </Button>
          </div>
        ))}
        {errors.inputs?.root && (
          <p className="text-xs text-red-600">{errors.inputs.root.message}</p>
        )}
        <Button
          type="button"
          variant="secondary"
          onClick={() => inputsArray.append({ productId: "", quantity: 1 })}
        >
          + Ajouter un intrant
        </Button>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-gray-700">Produits obtenus</h3>
        {outputsArray.fields.map((field, index) => (
          <div key={field.id} className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Produit</label>
              <select
                className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                {...register(`outputs.${index}.productId` as const)}
              >
                <option value="">— Choisir —</option>
                {products?.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} ({product.unit})
                  </option>
                ))}
              </select>
              {errors.outputs?.[index]?.productId && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.outputs[index]?.productId?.message}
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Quantité</label>
              <Input type="number" step="0.001" {...register(`outputs.${index}.quantity` as const)} />
            </div>
            <Button type="button" variant="secondary" onClick={() => outputsArray.remove(index)}>
              Retirer
            </Button>
          </div>
        ))}
        {errors.outputs?.root && (
          <p className="text-xs text-red-600">{errors.outputs.root.message}</p>
        )}
        <Button
          type="button"
          variant="secondary"
          onClick={() => outputsArray.append({ productId: "", quantity: 1 })}
        >
          + Ajouter un extrant
        </Button>
      </div>

      <Button type="submit" disabled={isSubmitting}>
        Créer la transformation
      </Button>

      {serverError && <p className="text-sm text-red-600">{serverError}</p>}
    </form>
  );
}
