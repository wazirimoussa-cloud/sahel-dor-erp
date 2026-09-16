import { useState } from "react";
import { Controller, useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useActiveProducts } from "@/features/products/useProducts";
import { useActiveSuppliers } from "@/features/suppliers/useSuppliers";
import { useActiveWarehouses } from "@/features/warehouses/useWarehouses";
import { useAllTransporters } from "@/features/transporters/useTransporters";
import { useCreatePurchase } from "@/features/purchases/usePurchases";
import { Button } from "@/components/ui/Button";
import { AmountInput } from "@/components/ui/AmountInput";
import { describeMutationError } from "@/lib/errorMessages";

// transporterId/transportFee optionnels mais liés : connus dès la création (pas seulement à
// la réception comme pour la déclaration de perte) pour pouvoir payer l'avance transport
// avant le départ des camions -- voir pay_transport_advance/pay_transport_balance (0097).
const purchaseSchema = z
  .object({
    supplierId: z.string().uuid("Choisissez un fournisseur"),
    warehouseId: z.string().uuid("Choisissez un magasin"),
    transporterId: z.string().optional(),
    transportFee: z.number().positive("Le montant du transport doit être positif").optional(),
    items: z
      .array(
        z.object({
          productId: z.string().uuid("Choisissez un produit"),
          quantity: z.coerce.number().positive("La quantité doit être positive"),
        }),
      )
      .min(1, "Ajoutez au moins une ligne"),
  })
  .refine((v) => !!v.transporterId === !!v.transportFee, {
    message: "Le transporteur et le montant du transport vont ensemble : les deux ou aucun",
    path: ["transportFee"],
  });

type PurchaseFormValues = z.infer<typeof purchaseSchema>;

export function NewPurchaseForm({ onCreated }: { onCreated?: () => void }) {
  const { data: products } = useActiveProducts();
  const { data: suppliers } = useActiveSuppliers();
  const { data: warehouses } = useActiveWarehouses();
  const { data: transporters } = useAllTransporters();
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
        transporterId: values.transporterId || undefined,
        transportFee: values.transportFee,
        items: values.items,
      });
      reset({
        supplierId: values.supplierId,
        warehouseId: values.warehouseId,
        transporterId: "",
        transportFee: undefined,
        items: [{ productId: "", quantity: 1 }],
      });
      onCreated?.();
    } catch (err) {
      setServerError(describeMutationError(err, "Bon d'achat refusé (rôle non autorisé)."));
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
      <div className="flex flex-wrap gap-3">
        <div>
          <label htmlFor="purchase-supplierId" className="mb-1 block text-xs font-medium text-gray-600">
            Fournisseur
          </label>
          <select
            id="purchase-supplierId"
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
          <label htmlFor="purchase-warehouseId" className="mb-1 block text-xs font-medium text-gray-600">
            Magasin
          </label>
          <select
            id="purchase-warehouseId"
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
          <label htmlFor="purchase-transporterId" className="mb-1 block text-xs font-medium text-gray-600">
            Transporteur (optionnel)
          </label>
          <select
            id="purchase-transporterId"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            {...register("transporterId")}
          >
            <option value="">— Aucun —</option>
            {transporters?.map((transporter) => (
              <option key={transporter.id} value={transporter.id}>
                {transporter.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="purchase-transportFee" className="mb-1 block text-xs font-medium text-gray-600">
            Montant du transport (optionnel)
          </label>
          <Controller
            control={control}
            name="transportFee"
            render={({ field }) => (
              <AmountInput
                id="purchase-transportFee"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
              />
            )}
          />
          <p className="mt-1 text-xs text-gray-500">
            Payé en 2 fois : la moitié au départ, la moitié à la livraison (déduite des pertes
            constatées).
          </p>
          {errors.transportFee && (
            <p className="mt-1 text-xs text-red-600">{errors.transportFee.message}</p>
          )}
        </div>
      </div>

      {fields.map((field, index) => (
        <div key={field.id} className="flex flex-wrap items-end gap-3">
          <div>
            <label
              htmlFor={`purchase-items-${index}-productId`}
              className="mb-1 block text-xs font-medium text-gray-600"
            >
              Produit
            </label>
            <select
              id={`purchase-items-${index}-productId`}
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
            <label
              htmlFor={`purchase-items-${index}-quantity`}
              className="mb-1 block text-xs font-medium text-gray-600"
            >
              Quantité
            </label>
            <Controller
              control={control}
              name={`items.${index}.quantity` as const}
              render={({ field }) => (
                <AmountInput
                  id={`purchase-items-${index}-quantity`}
                  allowDecimals
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                />
              )}
            />
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
          Créer le bon d'achat
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
