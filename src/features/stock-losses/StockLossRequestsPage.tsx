import { useState } from "react";
import { useAuth } from "@/auth/useAuth";
import {
  useStockLossRequests,
  useApproveStockLoss,
  useRejectStockLoss,
} from "@/features/stock-losses/useStockLossRequests";
import { RequestStockLossForm } from "@/features/stock-losses/RequestStockLossForm";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

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

export function StockLossRequestsPage() {
  const { profile } = useAuth();
  const { data: requests, isLoading, error } = useStockLossRequests();
  const approve = useApproveStockLoss();
  const reject = useRejectStockLoss();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const canRequest =
    profile?.role === "warehouse_manager" ||
    profile?.role === "production_manager" ||
    profile?.role === "logistics_transport";
  const canApprove = profile?.role === "controller";

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
              <th className="py-2">Date</th>
              <th className="py-2">Produit</th>
              <th className="py-2">Magasin</th>
              <th className="py-2">Quantité</th>
              <th className="py-2">Motif</th>
              <th className="py-2">Demandeur</th>
              <th className="py-2">Statut</th>
              {canApprove && <th className="py-2" />}
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
                            onClick={() => void approve.mutateAsync(r.id)}
                          >
                            Approuver
                          </Button>
                          {rejectingId === r.id ? (
                            <div className="flex flex-col gap-1">
                              <input
                                type="text"
                                placeholder="Motif du rejet"
                                className="rounded-md border border-gray-300 px-2 py-1 text-xs"
                                value={rejectionReason}
                                onChange={(e) => setRejectionReason(e.target.value)}
                              />
                              <Button
                                variant="danger"
                                disabled={reject.isPending || !rejectionReason.trim()}
                                onClick={() =>
                                  void reject
                                    .mutateAsync({ requestId: r.id, rejectionReason })
                                    .then(() => {
                                      setRejectingId(null);
                                      setRejectionReason("");
                                    })
                                }
                              >
                                Confirmer le rejet
                              </Button>
                            </div>
                          ) : (
                            <Button variant="danger" onClick={() => setRejectingId(r.id)}>
                              Rejeter
                            </Button>
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
                <td colSpan={canApprove ? 8 : 7} className="py-4 text-center text-gray-400">
                  Aucune déclaration de perte pour le moment.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
