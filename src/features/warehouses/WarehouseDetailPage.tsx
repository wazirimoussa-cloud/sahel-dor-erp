import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useWarehouse } from "@/features/warehouses/useWarehouses";
import { useWarehouseTransactions, useWarehouseLots } from "@/features/warehouses/useWarehouseHistory";
import { useAllProducts } from "@/features/products/useProducts";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { TRANSACTION_TYPE_LABELS, lotStatus } from "@/lib/stockDisplay";
import type { TransactionType } from "@/lib/database.types";

export function WarehouseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: warehouse, isLoading, error } = useWarehouse(id);
  const { data: products } = useAllProducts();

  const [productId, setProductId] = useState("");
  const [type, setType] = useState<TransactionType | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const filters = {
    productId: productId || undefined,
    type: type || undefined,
    from: from || undefined,
    to: to || undefined,
  };

  const { data: transactions, isLoading: isLoadingTx } = useWarehouseTransactions(id, filters);
  const { data: lots, isLoading: isLoadingLots } = useWarehouseLots(id, {
    productId: filters.productId,
    from: filters.from,
    to: filters.to,
  });

  if (isLoading) return <p className="text-sm text-gray-500">Chargement…</p>;
  if (error || !warehouse) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-red-600">Magasin introuvable ou accès refusé.</p>
        <Link to="/warehouses" className="text-sm text-brand-600 hover:underline">
          ← Retour aux magasins
        </Link>
      </div>
    );
  }

  function resetFilters() {
    setProductId("");
    setType("");
    setFrom("");
    setTo("");
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/warehouses" className="text-sm text-brand-600 hover:underline">
          ← Retour aux magasins
        </Link>
      </div>

      <div>
        <h1 className="text-lg font-bold text-forest-900">{warehouse.name}</h1>
        <p className="text-sm text-gray-500">{warehouse.location ?? "Emplacement non renseigné"}</p>
      </div>

      <Card>
        <h2 className="mb-3 text-base font-semibold text-gray-800">Rechercher dans l'historique</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="wh-detail-productId" className="mb-1 block text-xs font-medium text-gray-600">
              Produit
            </label>
            <select
              id="wh-detail-productId"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
            >
              <option value="">Tous les produits</option>
              {products?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="wh-detail-type" className="mb-1 block text-xs font-medium text-gray-600">
              Type de mouvement
            </label>
            <select
              id="wh-detail-type"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              value={type}
              onChange={(e) => setType(e.target.value as TransactionType | "")}
            >
              <option value="">Tous les types</option>
              <option value="IN">Entrée</option>
              <option value="OUT">Sortie</option>
              <option value="ADJUSTMENT">Ajustement</option>
            </select>
          </div>
          <div>
            <label htmlFor="wh-detail-from" className="mb-1 block text-xs font-medium text-gray-600">
              Depuis le
            </label>
            <Input id="wh-detail-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label htmlFor="wh-detail-to" className="mb-1 block text-xs font-medium text-gray-600">
              Jusqu'au
            </label>
            <Input id="wh-detail-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <button
            type="button"
            onClick={resetFilters}
            className="text-sm text-gray-500 hover:text-gray-700 hover:underline"
          >
            Réinitialiser
          </button>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-base font-semibold text-gray-800">Mouvements</h2>
        {isLoadingTx && <p className="text-sm text-gray-500">Chargement…</p>}
        {transactions && (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th scope="col" className="py-2">Date</th>
                <th scope="col" className="py-2">Produit</th>
                <th scope="col" className="py-2">Type</th>
                <th scope="col" className="py-2">Quantité</th>
                <th scope="col" className="py-2">Coût unitaire</th>
                <th scope="col" className="py-2">Péremption</th>
                <th scope="col" className="py-2">Provenance / Destination</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => {
                const product = tx.products as
                  { name: string; unit: string } | { name: string; unit: string }[] | null;
                const productInfo = Array.isArray(product) ? product[0] : product;
                return (
                  <tr key={tx.id} className="border-b border-gray-100">
                    <td className="py-2">{new Date(tx.created_at).toLocaleString("fr-FR")}</td>
                    <td className="py-2">{productInfo?.name ?? "—"}</td>
                    <td className="py-2">{TRANSACTION_TYPE_LABELS[tx.type] ?? tx.type}</td>
                    <td className="py-2">
                      {tx.quantity} {productInfo?.unit ?? ""}
                    </td>
                    <td className="py-2">
                      {tx.unit_cost != null ? `${tx.unit_cost.toLocaleString("fr-FR")} FCFA` : "—"}
                    </td>
                    <td className="py-2">
                      {tx.expiry_date ? new Date(tx.expiry_date).toLocaleDateString("fr-FR") : "—"}
                    </td>
                    <td className="py-2 text-gray-500">{tx.note ?? "—"}</td>
                  </tr>
                );
              })}
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-4 text-center text-gray-500">
                    Aucun mouvement pour cette recherche.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-base font-semibold text-gray-800">Lots</h2>
        {isLoadingLots && <p className="text-sm text-gray-500">Chargement…</p>}
        {lots && (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th scope="col" className="py-2">Lot</th>
                <th scope="col" className="py-2">Produit</th>
                <th scope="col" className="py-2">Créé le</th>
                <th scope="col" className="py-2">Quantité reçue</th>
                <th scope="col" className="py-2">Quantité restante</th>
                <th scope="col" className="py-2">Coût unitaire</th>
                <th scope="col" className="py-2">Péremption</th>
                <th scope="col" className="py-2" />
              </tr>
            </thead>
            <tbody>
              {lots.map((lot) => {
                const product = lot.products as
                  { name: string; unit: string } | { name: string; unit: string }[] | null;
                const productInfo = Array.isArray(product) ? product[0] : product;
                const status = lotStatus(lot.expiry_date);
                return (
                  <tr key={lot.id} className="border-b border-gray-100">
                    <td className="py-2">Lot #{lot.lot_number}</td>
                    <td className="py-2">{productInfo?.name ?? "—"}</td>
                    <td className="py-2">{new Date(lot.created_at).toLocaleDateString("fr-FR")}</td>
                    <td className="py-2">
                      {lot.quantity_received} {productInfo?.unit ?? ""}
                    </td>
                    <td className={`py-2 ${lot.quantity_remaining <= 0 ? "text-gray-500" : ""}`}>
                      {lot.quantity_remaining} {productInfo?.unit ?? ""}
                    </td>
                    <td className="py-2">{lot.unit_cost.toLocaleString("fr-FR")} FCFA</td>
                    <td className="py-2">
                      {lot.expiry_date
                        ? new Date(lot.expiry_date).toLocaleDateString("fr-FR")
                        : "—"}
                    </td>
                    <td className="py-2">
                      {status && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}
                        >
                          {status.label}
                        </span>
                      )}
                      {lot.quantity_remaining <= 0 && (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                          Épuisé
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {lots.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-4 text-center text-gray-500">
                    Aucun lot pour cette recherche.
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
