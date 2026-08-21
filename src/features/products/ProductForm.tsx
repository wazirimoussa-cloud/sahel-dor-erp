import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/auth/useAuth";
import { useCreateProduct } from "@/features/products/useProducts";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { formatNumber } from "@/lib/format";

const UNITS = ["tonne", "carton", "bidon", "unité"] as const;

const productSchema = z
  .object({
    name: z.string().min(1, "Nom requis"),
    purchaseCost: z.coerce.number().min(0, "Le prix global d'achat doit être positif"),
    freightCost: z.coerce.number().min(0, "Les frais de transport doivent être positifs"),
    handlingCost: z.coerce.number().min(0, "Les frais de manutention doivent être positifs"),
    sellingPrice: z.coerce.number().min(0, "Le prix de vente doit être positif"),
    stock: z.coerce.number().min(0, "Le stock initial doit être positif"),
    unit: z.enum(UNITS),
    vatExempt: z.boolean(),
  })
  .refine((values) => values.purchaseCost === 0 || values.stock > 0, {
    message: "Le stock initial doit être supérieur à 0 pour calculer le prix de revient",
    path: ["stock"],
  });

type ProductFormValues = z.infer<typeof productSchema>;

export function ProductForm({ onCreated }: { onCreated?: () => void }) {
  const { profile } = useAuth();
  const createProduct = useCreateProduct();
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      stock: 0,
      unit: "unité",
      vatExempt: false,
      purchaseCost: 0,
      freightCost: 0,
      handlingCost: 0,
      sellingPrice: 0,
    },
  });

  const [purchaseCost, freightCost, handlingCost, stock] = watch([
    "purchaseCost",
    "freightCost",
    "handlingCost",
    "stock",
  ]);
  const previewUnitCost =
    Number(stock) > 0
      ? (Number(purchaseCost) + Number(freightCost) + Number(handlingCost)) / Number(stock)
      : 0;

  async function onSubmit(values: ProductFormValues) {
    if (!profile?.companyId) return;
    await createProduct.mutateAsync({ ...values, companyId: profile.companyId });
    reset();
    onCreated?.();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-wrap items-end gap-3" noValidate>
      <div>
        <label htmlFor="product-name" className="mb-1 block text-xs font-medium text-gray-600">
          Nom du produit
        </label>
        <Input id="product-name" {...register("name")} />
        {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
      </div>
      <div>
        <label htmlFor="product-purchase-cost" className="mb-1 block text-xs font-medium text-gray-600">
          Prix global d'achat
        </label>
        <Input id="product-purchase-cost" type="number" step="0.01" {...register("purchaseCost")} />
        {errors.purchaseCost && <p className="mt-1 text-xs text-red-600">{errors.purchaseCost.message}</p>}
      </div>
      <div>
        <label htmlFor="product-freight-cost" className="mb-1 block text-xs font-medium text-gray-600">
          Frais de transport
        </label>
        <Input id="product-freight-cost" type="number" step="0.01" {...register("freightCost")} />
        {errors.freightCost && <p className="mt-1 text-xs text-red-600">{errors.freightCost.message}</p>}
      </div>
      <div>
        <label htmlFor="product-handling-cost" className="mb-1 block text-xs font-medium text-gray-600">
          Frais de manutention
        </label>
        <Input id="product-handling-cost" type="number" step="0.01" {...register("handlingCost")} />
        {errors.handlingCost && <p className="mt-1 text-xs text-red-600">{errors.handlingCost.message}</p>}
      </div>
      <div>
        <label htmlFor="product-stock" className="mb-1 block text-xs font-medium text-gray-600">
          Stock initial
        </label>
        <Input id="product-stock" type="number" step="0.001" {...register("stock")} />
        {errors.stock && <p className="mt-1 text-xs text-red-600">{errors.stock.message}</p>}
      </div>
      <p className="w-full text-xs text-gray-500">
        Prix de revient unitaire estimé : {formatNumber(previewUnitCost)} FCFA (fixé
        définitivement à la création du produit) — à titre de repère pour fixer le prix de
        vente ci-dessous.
      </p>
      <div>
        <label htmlFor="product-selling-price" className="mb-1 block text-xs font-medium text-gray-600">
          Prix de vente
        </label>
        <Input id="product-selling-price" type="number" step="0.01" {...register("sellingPrice")} />
        {errors.sellingPrice && <p className="mt-1 text-xs text-red-600">{errors.sellingPrice.message}</p>}
      </div>
      <div>
        <label htmlFor="product-unit" className="mb-1 block text-xs font-medium text-gray-600">
          Unité
        </label>
        <select
          id="product-unit"
          className="rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          {...register("unit")}
        >
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="vatExempt" className="h-4 w-4" {...register("vatExempt")} />
        <label htmlFor="vatExempt" className="text-xs font-medium text-gray-600">
          Exonéré de TVA (céréales, sel)
        </label>
      </div>
      <Button type="submit" disabled={isSubmitting}>
        Ajouter le produit
      </Button>
    </form>
  );
}
