import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/auth/useAuth";
import { useCreateProduct } from "@/features/products/useProducts";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const UNITS = ["tonne", "carton", "bidon", "unité"] as const;

const productSchema = z.object({
  name: z.string().min(1, "Nom requis"),
  price: z.coerce.number().min(0, "Le prix doit être positif"),
  stock: z.coerce.number().min(0, "Le stock initial doit être positif"),
  unit: z.enum(UNITS),
  vatExempt: z.boolean(),
});

type ProductFormValues = z.infer<typeof productSchema>;

export function ProductForm({ onCreated }: { onCreated?: () => void }) {
  const { profile } = useAuth();
  const createProduct = useCreateProduct();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: { stock: 0, unit: "unité", vatExempt: false },
  });

  async function onSubmit(values: ProductFormValues) {
    if (!profile?.companyId) return;
    await createProduct.mutateAsync({ ...values, companyId: profile.companyId });
    reset();
    onCreated?.();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-wrap items-end gap-3" noValidate>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">Nom</label>
        <Input {...register("name")} />
        {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">Prix</label>
        <Input type="number" step="0.01" {...register("price")} />
        {errors.price && <p className="mt-1 text-xs text-red-600">{errors.price.message}</p>}
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">Stock initial</label>
        <Input type="number" step="0.001" {...register("stock")} />
        {errors.stock && <p className="mt-1 text-xs text-red-600">{errors.stock.message}</p>}
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">Unité</label>
        <select
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
