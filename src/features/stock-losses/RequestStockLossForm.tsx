import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useActiveProducts } from "@/features/products/useProducts";
import { useActiveWarehouses, useWarehouseStock } from "@/features/warehouses/useWarehouses";
import { useRequestStockLoss } from "@/features/stock-losses/useStockLossRequests";
import { useStockLots } from "@/features/stock/useStockLots";
import { lotStatus } from "@/lib/stockDisplay";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { AmountInput } from "@/components/ui/AmountInput";

const schema = z
  .object({
    productId: z.string().uuid("Choisissez un produit"),
    warehouseId: z.string().uuid("Choisissez un magasin"),
    quantity: z.coerce.number().positive("La quantité doit être positive"),
    isRepackaging: z.boolean(),
    repackagedQuantity: z.coerce.number().optional(),
    reason: z.string().min(3, "Précisez un motif"),
    lotId: z.string().optional(),
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
  const { data: products } = useActiveProducts();
  const { data: warehouses } = useActiveWarehouses();
  const { data: lots } = useStockLots();
  const requestLoss = useRequestStockLoss();
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    watch,
    reset,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { isRepackaging: false, lotId: "" },
  });

  const isRepackaging = watch("isRepackaging");
  const selectedProductId = watch("productId");
  const selectedWarehouseId = watch("warehouseId");
  const selectedLotId = watch("lotId");

  const matchingLots = useMemo(
    () =>
      (lots ?? []).filter(
        (lot) => lot.product_id === selectedProductId && lot.warehouse_id === selectedWarehouseId,
      ),
    [lots, selectedProductId, selectedWarehouseId],
  );

  // Même vérification qu'à l'émission d'un bon de commande (NewOrderForm) : rien ne
  // comparait la quantité déclarée au stock réellement disponible avant que
  // product_stocks_stock_check (ou fn_consume_specific_lot pour un lot ciblé) ne bloque,
  // opaquement, seulement à l'approbation par le Contrôleur.
  const { data: warehouseStock, isLoading: isLoadingWarehouseStock } = useWarehouseStock(
    selectedWarehouseId || undefined,
  );
  const stockByProduct = new Map((warehouseStock ?? []).map((row) => [row.product_id, row.stock]));
  const targetedLot = selectedLotId ? matchingLots.find((lot) => lot.id === selectedLotId) : undefined;

  // Un lot sélectionné pour un produit/magasin donné ne veut plus rien dire si le
  // produit ou le magasin change ensuite -- react-hook-form garde la valeur en mémoire
  // même quand le <select> disparaît du DOM, donc on la vide explicitement.
  useEffect(() => {
    setValue("lotId", "");
  }, [selectedProductId, selectedWarehouseId, setValue]);

  async function onSubmit(values: FormValues) {
    setServerError(null);
    setSuccessMessage(null);

    // La quantité reconditionnée n'a pas besoin de cette vérification : c'est une entrée
    // (IN) qui suit la quantité déclarée en perte, jamais une nouvelle sortie de stock.
    if (values.lotId) {
      const available = targetedLot?.quantity_remaining ?? 0;
      if (values.quantity > available) {
        setError("quantity", {
          type: "manual",
          message: `Quantité restante insuffisante sur ce lot (disponible : ${available})`,
        });
        setServerError("Quantité supérieure au restant sur le lot ciblé — voir le détail ci-dessous.");
        return;
      }
    } else {
      if (selectedWarehouseId && isLoadingWarehouseStock) {
        setServerError("Chargement du stock de ce magasin en cours — réessayez dans un instant.");
        return;
      }
      const available = stockByProduct.get(values.productId) ?? 0;
      if (values.quantity > available) {
        setError("quantity", {
          type: "manual",
          message: `Stock insuffisant à ce magasin (disponible : ${available})`,
        });
        setServerError("Quantité supérieure au stock disponible dans ce magasin — voir le détail ci-dessous.");
        return;
      }
    }

    try {
      await requestLoss.mutateAsync({
        productId: values.productId,
        warehouseId: values.warehouseId,
        quantity: values.quantity,
        reason: values.reason,
        repackagedQuantity: values.isRepackaging ? values.repackagedQuantity : undefined,
        lotId: values.lotId ? values.lotId : undefined,
      });
      reset({ isRepackaging: false, lotId: "" });
      setSuccessMessage("Demande envoyée — en attente de validation par le Contrôleur.");
    } catch {
      setServerError("Demande refusée (rôle non autorisé, ou produit/magasin/lot invalide).");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="flex flex-wrap gap-3">
        <div>
          <label htmlFor="loss-productId" className="mb-1 block text-xs font-medium text-gray-600">
            Produit
          </label>
          <select
            id="loss-productId"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            {...register("productId")}
          >
            <option value="">— Choisir —</option>
            {products?.map((product) => {
              const stockLabel = selectedWarehouseId
                ? `stock à ce magasin : ${stockByProduct.get(product.id) ?? 0}`
                : `stock total : ${product.stock}`;
              return (
                <option key={product.id} value={product.id}>
                  {product.name} ({stockLabel} {product.unit})
                </option>
              );
            })}
          </select>
          {errors.productId && <p className="mt-1 text-xs text-red-600">{errors.productId.message}</p>}
        </div>

        <div>
          <label htmlFor="loss-warehouseId" className="mb-1 block text-xs font-medium text-gray-600">
            Magasin
          </label>
          <select
            id="loss-warehouseId"
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
          <label htmlFor="loss-quantity" className="mb-1 block text-xs font-medium text-gray-600">
            Quantité concernée
          </label>
          <Controller
            control={control}
            name="quantity"
            render={({ field }) => (
              <AmountInput id="loss-quantity" allowDecimals value={field.value} onChange={field.onChange} onBlur={field.onBlur} />
            )}
          />
          {errors.quantity && <p className="mt-1 text-xs text-red-600">{errors.quantity.message}</p>}
        </div>
      </div>

      {matchingLots.length > 0 && (
        <div>
          <label htmlFor="loss-lotId" className="mb-1 block text-xs font-medium text-gray-600">
            Lot ciblé (optionnel — sinon la sortie suit l'ordre FEFO habituel)
          </label>
          <select
            id="loss-lotId"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            {...register("lotId")}
          >
            <option value="">— Aucun (FEFO automatique) —</option>
            {matchingLots.map((lot) => {
              const status = lotStatus(lot.expiry_date);
              return (
                <option key={lot.id} value={lot.id}>
                  Lot #{lot.lot_number} — {lot.quantity_remaining} restant
                  {lot.expiry_date ? ` — péremption ${lot.expiry_date}` : ""}
                  {status ? ` — ${status.label}` : ""}
                </option>
              );
            })}
          </select>
        </div>
      )}

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" {...register("isRepackaging")} />
        Reconditionnement (une partie est récupérée dans un nouvel emballage)
      </label>

      {isRepackaging && (
        <div>
          <label htmlFor="repackagedQuantity" className="mb-1 block text-xs font-medium text-gray-600">
            Quantité récupérée après reconditionnement
          </label>
          <Controller
            control={control}
            name="repackagedQuantity"
            render={({ field }) => (
              <AmountInput
                id="repackagedQuantity"
                allowDecimals
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
              />
            )}
          />
          {errors.repackagedQuantity && (
            <p className="mt-1 text-xs text-red-600">{errors.repackagedQuantity.message}</p>
          )}
        </div>
      )}

      <div>
        <label htmlFor="loss-reason" className="mb-1 block text-xs font-medium text-gray-600">
          Motif
        </label>
        <Input
          id="loss-reason"
          type="text"
          placeholder="Ex : sac déchiré à la manutention"
          {...register("reason")}
        />
        {errors.reason && <p className="mt-1 text-xs text-red-600">{errors.reason.message}</p>}
      </div>

      <Button type="submit" disabled={isSubmitting}>
        Déclarer la perte
      </Button>

      {successMessage && (
        <p role="status" className="text-sm text-green-700">
          {successMessage}
        </p>
      )}
      {serverError && (
        <p role="alert" className="text-sm text-red-600">
          {serverError}
        </p>
      )}
    </form>
  );
}
