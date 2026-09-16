import { useState } from "react";
import { useAuth } from "@/auth/useAuth";
import {
  useStockLossRequests,
  useApproveStockLoss,
  useRejectStockLoss,
} from "@/features/stock-losses/useStockLossRequests";
import { RequestStockLossForm } from "@/features/stock-losses/RequestStockLossForm";
import { lotStatus } from "@/lib/stockDisplay";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Pagination } from "@/components/ui/Pagination";
import { usePagination } from "@/lib/usePagination";
import { supabase } from "@/lib/supabase";

// Même vérification qu'à la validation d'un bon de commande (OrderDetailPage) : le stock
// peut avoir bougé entre la déclaration (magasinier) et l'approbation (Contrôleur, souvent
// plus tard). Un lot ciblé est vérifié contre son propre reliquat (fn_consume_specific_lot
// le referait de toute façon en base, mais avec un message déjà clair -- ici on l'affiche
// simplement avant plutôt que de laisser échouer la RPC) ; sans lot ciblé (FEFO
// automatique), contre le stock du magasin (product_stocks_stock_check, message opaque en
// base, comme pour les commandes).
async function findStockLossShortage(
  warehouseId: string,
  productId: string,
  lotId: string | null,
  quantity: number,
  unit: string,
): Promise<string | null> {
  if (lotId) {
    const { data, error } = await supabase
      .from("stock_lots")
      .select("quantity_remaining")
      .eq("id", lotId)
      .maybeSingle();
    if (error || !data) return null;
    if (quantity > data.quantity_remaining) {
      return `Quantité restante insuffisante sur le lot ciblé (disponible : ${data.quantity_remaining} ${unit}, demandé : ${quantity} ${unit}).`;
    }
    return null;
  }

  const { data, error } = await supabase
    .from("product_stocks")
    .select("stock")
    .eq("warehouse_id", warehouseId)
    .eq("product_id", productId)
    .maybeSingle();
  if (error) return null;
  const available = data?.stock ?? 0;
  if (quantity > available) {
    return `Stock insuffisant dans ce magasin pour approuver cette perte (disponible : ${available} ${unit}, demandé : ${quantity} ${unit}).`;
  }
  return null;
}

function describeStockLossActionError(err: unknown): string {
  const code = (err as { code?: string } | null)?.code;
  const message = (err as { message?: string } | null)?.message ?? "";
  if (code === "23514" && message.includes("product_stocks_stock_check")) {
    return "Stock insuffisant dans ce magasin pour approuver cette perte.";
  }
  return message || "Action refusée (droits insuffisants ou demande déjà traitée).";
}

const STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  approved: "Approuvée",
  rejected: "Rejetée",
};

const STATUS_CLASSES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

function relationName(rel: { name: string } | { name: string }[] | null) {
  return Array.isArray(rel) ? rel[0]?.name : rel?.name;
}

function relationEmail(rel: { email: string } | { email: string }[] | null) {
  return Array.isArray(rel) ? rel[0]?.email : rel?.email;
}

function relationLot(
  rel:
    | { lot_number: number; expiry_date: string | null }
    | { lot_number: number; expiry_date: string | null }[]
    | null,
) {
  return Array.isArray(rel) ? rel[0] : rel;
}

export function StockLossRequestsPage() {
  const { hasAttribution } = useAuth();
  const { page, pageSize, goToPrevious, goToNext } = usePagination();
  const { data, isLoading, error } = useStockLossRequests(page, pageSize);
  const requests = data?.rows;
  const approve = useApproveStockLoss();
  const reject = useRejectStockLoss();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});

  const canRequest = hasAttribution("pertes_stock.declarer");
  const canApprove = hasAttribution("pertes_stock.approuver");

  async function handleApprove(request: {
    id: string;
    product_id: string;
    warehouse_id: string;
    lot_id: string | null;
    quantity: number;
    products: { name: string; unit: string } | { name: string; unit: string }[] | null;
  }) {
    setActionErrors((prev) => ({ ...prev, [request.id]: "" }));
    const productInfo = Array.isArray(request.products) ? request.products[0] : request.products;
    const shortage = await findStockLossShortage(
      request.warehouse_id,
      request.product_id,
      request.lot_id,
      request.quantity,
      productInfo?.unit ?? "",
    );
    if (shortage) {
      setActionErrors((prev) => ({ ...prev, [request.id]: shortage }));
      return;
    }
    try {
      await approve.mutateAsync(request.id);
    } catch (err) {
      setActionErrors((prev) => ({ ...prev, [request.id]: describeStockLossActionError(err) }));
    }
  }

  async function handleReject(requestId: string) {
    setActionErrors((prev) => ({ ...prev, [requestId]: "" }));
    try {
      await reject.mutateAsync({ requestId, rejectionReason });
      setRejectingId(null);
      setRejectionReason("");
    } catch (err) {
      setActionErrors((prev) => ({ ...prev, [requestId]: describeStockLossActionError(err) }));
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-forest-900">Pertes de stock</h1>
        <p className="mt-1 text-sm text-gray-500">
          Sacs déchirés, produits endommagés ou reconditionnement avec perte, constatés en magasin
          après réception. Chaque déclaration doit être validée par le Contrôleur avant de sortir
          réellement du stock — évite qu'une perte déclarée serve à couvrir un vol.
        </p>
      </div>

      {canRequest && (
        <Card>
          <RequestStockLossForm />
        </Card>
      )}

      <Card>
        {isLoading && <p className="text-sm text-gray-500">Chargement…</p>}
        {error && <p className="text-sm text-red-600">Impossible de charger les demandes.</p>}
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500">
              <th scope="col" className="py-2">Date</th>
              <th scope="col" className="py-2">Produit</th>
              <th scope="col" className="py-2">Magasin</th>
              <th scope="col" className="py-2">Quantité</th>
              <th scope="col" className="py-2">Motif</th>
              <th scope="col" className="py-2">Demandeur</th>
              <th scope="col" className="py-2">Statut</th>
              {canApprove && <th scope="col" className="py-2" />}
            </tr>
          </thead>
          <tbody>
            {requests?.map((r) => {
              const product = r.products as { name: string; unit: string } | { name: string; unit: string }[] | null;
              const productInfo = Array.isArray(product) ? product[0] : product;
              return (
                <tr key={r.id} className="border-b border-gray-100 align-top">
                  <td className="py-2">{new Date(r.created_at).toLocaleString("fr-FR")}</td>
                  <td className="py-2">{productInfo?.name ?? "—"}</td>
                  <td className="py-2">{relationName(r.warehouses)}</td>
                  <td className="py-2">
                    {r.quantity} {productInfo?.unit ?? ""}
                    {r.repackaged_quantity !== null && (
                      <span className="block text-xs text-gray-500">
                        → reconditionné : {r.repackaged_quantity} {productInfo?.unit ?? ""}
                      </span>
                    )}
                    {(() => {
                      const lot = relationLot(r.stock_lots);
                      if (!lot) return null;
                      const status = lotStatus(lot.expiry_date);
                      return (
                        <span className="block text-xs text-gray-500">
                          Lot ciblé : #{lot.lot_number}
                          {status && (
                            <span
                              className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${status.className}`}
                            >
                              {status.label}
                            </span>
                          )}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="py-2">
                    {r.reason}
                    {r.status === "rejected" && r.rejection_reason && (
                      <span className="block text-xs text-red-600">
                        Rejet : {r.rejection_reason}
                      </span>
                    )}
                  </td>
                  <td className="py-2">{relationEmail(r.requester)}</td>
                  <td className="py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[r.status] ?? ""}`}
                    >
                      {STATUS_LABELS[r.status] ?? r.status}
                    </span>
                  </td>
                  {canApprove && (
                    <td className="py-2">
                      {r.status === "pending" && (
                        <div className="flex flex-col gap-2">
                          <Button
                            disabled={approve.isPending}
                            onClick={() => void handleApprove(r)}
                          >
                            Approuver
                          </Button>
                          {rejectingId === r.id ? (
                            <div className="flex flex-col gap-1">
                              <input
                                type="text"
                                placeholder="Commentaire du rejet (obligatoire)"
                                className="rounded-md border border-gray-300 px-2 py-1 text-xs"
                                value={rejectionReason}
                                onChange={(e) => setRejectionReason(e.target.value)}
                              />
                              {rejectionReason.length > 0 && rejectionReason.trim().length < 3 && (
                                <p className="text-xs text-red-600">
                                  Le commentaire doit faire au moins 3 caractères.
                                </p>
                              )}
                              <Button
                                variant="danger"
                                disabled={reject.isPending || rejectionReason.trim().length < 3}
                                onClick={() => void handleReject(r.id)}
                              >
                                Confirmer le rejet
                              </Button>
                            </div>
                          ) : (
                            <Button variant="danger" onClick={() => setRejectingId(r.id)}>
                              Rejeter
                            </Button>
                          )}
                          {actionErrors[r.id] && (
                            <p role="alert" className="text-xs text-red-600">
                              {actionErrors[r.id]}
                            </p>
                          )}
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            {requests?.length === 0 && (
              <tr>
                <td colSpan={canApprove ? 8 : 7} className="py-4 text-center text-gray-500">
                  Aucune déclaration de perte pour le moment.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {requests && (
          <Pagination
            page={page}
            hasNextPage={data?.hasNextPage ?? false}
            onPrevious={goToPrevious}
            onNext={goToNext}
          />
        )}
      </Card>
    </div>
  );
}
