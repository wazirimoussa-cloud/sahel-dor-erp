import { Fragment, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/auth/useAuth";
import {
  useProducts,
  useUpdateProductPrice,
  usePriceHistory,
} from "@/features/products/useProducts";
import { ProductForm } from "@/features/products/ProductForm";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { isLowStock } from "@/lib/stockThreshold";

const priceSchema = z.object({
  newPrice: z.coerce.number().min(0, "Le prix doit être positif"),
  reason: z.string().max(200).optional(),
});
type PriceFormValues = z.infer<typeof priceSchema>;

function PriceHistoryRows({ productId }: { productId: string }) {
  const { data: history, isLoading } = usePriceHistory(productId);
  if (isLoading) return <p className="py-2 text-xs text-gray-400">Chargement…</p>;
  if (!history || history.length === 0) {
    return <p className="py-2 text-xs text-gray-400">Aucun changement de prix enregistré.</p>;
  }
  return (
    <table className="w-full text-left text-xs text-gray-600">
      <tbody>
        {history.map((h) => {
          const userRelation = h.users as { email: string } | { email: string }[] | null;
          const userEmail = Array.isArray(userRelation) ? userRelation[0]?.email : userRelation?.email;
          return (
            <tr key={h.id} className="border-b border-gray-100">
              <td className="py-1 pr-3">{new Date(h.created_at).toLocaleString("fr-FR")}</td>
              <td className="py-1 pr-3">
                {h.old_price.toLocaleString("fr-FR")} → {h.new_price.toLocaleString("fr-FR")} FCFA
              </td>
              <td className="py-1 pr-3">{h.reason ?? "—"}</td>
              <td className="py-1">{userEmail ?? "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function ProductsPage() {
  const { profile } = useAuth();
  const { data: products, isLoading, error } = useProducts();
  const updatePrice = useUpdateProductPrice();
  const canManage =
    profile?.role === "warehouse_manager" || profile?.role === "production_manager";

  const [editingId, setEditingId] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PriceFormValues>({ resolver: zodResolver(priceSchema) });

  async function onSubmitPrice(productId: string, values: PriceFormValues) {
    setPriceError(null);
    try {
      await updatePrice.mutateAsync({
        productId,
        newPrice: values.newPrice,
        reason: values.reason,
      });
      setEditingId(null);
      reset();
    } catch {
      setPriceError("Modification refusée (rôle non autorisé ou produit invalide).");
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-gray-800">Produits</h1>

      {canManage && (
        <Card>
          <ProductForm />
        </Card>
      )}

      <Card>
        {isLoading && <p className="text-sm text-gray-500">Chargement…</p>}
        {error && <p className="text-sm text-red-600">Impossible de charger les produits.</p>}
        {products && (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="py-2">Nom</th>
                <th className="py-2">Prix</th>
                <th className="py-2">Stock</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <Fragment key={product.id}>
                  <tr className="border-b border-gray-100">
                    <td className="py-2">{product.name}</td>
                    <td className="py-2">
                      {product.price.toLocaleString("fr-FR")} FCFA / {product.unit}
                    </td>
                    <td
                      className={`py-2 ${isLowStock(product.stock, product.unit) ? "font-semibold text-red-600" : ""}`}
                    >
                      {product.stock} {product.unit}
                    </td>
                    <td className="py-2 text-right">
                      <div className="flex justify-end gap-3">
                        {canManage && (
                          <button
                            type="button"
                            className="text-xs text-brand-600 hover:underline"
                            onClick={() => {
                              setEditingId(editingId === product.id ? null : product.id);
                              setPriceError(null);
                              reset({ newPrice: product.price, reason: "" });
                            }}
                          >
                            Modifier le prix
                          </button>
                        )}
                        <button
                          type="button"
                          className="text-xs text-gray-500 hover:underline"
                          onClick={() => setHistoryId(historyId === product.id ? null : product.id)}
                        >
                          Historique
                        </button>
                      </div>
                    </td>
                  </tr>
                  {editingId === product.id && (
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <td colSpan={4} className="py-2">
                        <form
                          onSubmit={handleSubmit((values) => onSubmitPrice(product.id, values))}
                          className="flex flex-wrap items-end gap-3"
                          noValidate
                        >
                          <div>
                            <label className="mb-1 block text-xs font-medium text-gray-600">
                              Nouveau prix
                            </label>
                            <Input type="number" step="0.01" {...register("newPrice")} />
                            {errors.newPrice && (
                              <p className="mt-1 text-xs text-red-600">{errors.newPrice.message}</p>
                            )}
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-gray-600">
                              Motif (rabais, augmentation…)
                            </label>
                            <Input type="text" placeholder="Optionnel" {...register("reason")} />
                          </div>
                          <Button type="submit" disabled={updatePrice.isPending}>
                            Enregistrer
                          </Button>
                          <Button type="button" variant="secondary" onClick={() => setEditingId(null)}>
                            Annuler
                          </Button>
                          {priceError && <p className="w-full text-xs text-red-600">{priceError}</p>}
                        </form>
                      </td>
                    </tr>
                  )}
                  {historyId === product.id && (
                    <tr className="border-b border-gray-100">
                      <td colSpan={4} className="py-2">
                        <PriceHistoryRows productId={product.id} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {products.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-gray-400">
                    Aucun produit pour le moment.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
