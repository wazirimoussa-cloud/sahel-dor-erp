import { useAuth } from "@/auth/useAuth";
import { useProducts } from "@/features/products/useProducts";
import { ProductForm } from "@/features/products/ProductForm";
import { Card } from "@/components/ui/Card";

export function ProductsPage() {
  const { profile } = useAuth();
  const { data: products, isLoading, error } = useProducts();
  const canManage =
    profile?.role === "admin" ||
    profile?.role === "logistics" ||
    profile?.role === "production_manager";

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
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id} className="border-b border-gray-100">
                  <td className="py-2">{product.name}</td>
                  <td className="py-2">{product.price.toLocaleString("fr-FR")} FCFA</td>
                  <td className={`py-2 ${product.stock < 5 ? "font-semibold text-red-600" : ""}`}>
                    {product.stock}
                  </td>
                </tr>
              ))}
              {products.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-4 text-center text-gray-400">
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
