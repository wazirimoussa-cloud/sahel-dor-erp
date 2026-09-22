import { Fragment, useState } from "react";
import { Link } from "react-router-dom";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/auth/useAuth";
import {
  useAllPurchaseLosses,
  useAllPurchaseLossRecoveredTotals,
  useAllPurchaseLossWrittenOffTotals,
  usePurchaseLossRecoveries,
  useRecordPurchaseLossRecovery,
  useWriteOffPurchaseLoss,
} from "@/features/purchases/usePurchases";
import { generateCreditNotePdf } from "@/lib/pdf";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AmountInput } from "@/components/ui/AmountInput";
import { formatNumber } from "@/lib/format";

const recoverySchema = z.object({
  amount: z.number({ invalid_type_error: "Montant requis" }).positive("Le montant doit être positif"),
});
type RecoveryFormValues = z.infer<typeof recoverySchema>;

const writeOffSchema = z.object({
  amount: z.number({ invalid_type_error: "Montant requis" }).positive("Le montant doit être positif"),
  reason: z.string().trim().min(1, "Un motif est requis"),
});
type WriteOffFormValues = z.infer<typeof writeOffSchema>;

const RECOVERY_SOURCE_LABELS: Record<string, string> = {
  cash: "Espèces",
  solde_transport: "Déduit du solde transport",
};

function RecoveryHistoryRows({ lossId }: { lossId: string }) {
  const { data: recoveries, isLoading } = usePurchaseLossRecoveries(lossId);
  if (isLoading) return <p className="py-2 text-xs text-gray-500">Chargement…</p>;
  if (!recoveries || recoveries.length === 0) {
    return <p className="py-2 text-xs text-gray-500">Aucun recouvrement enregistré.</p>;
  }
  return (
    <table className="w-full text-left text-xs text-gray-600">
      <tbody>
        {recoveries.map((r) => {
          const userRelation = r.users as { email: string } | { email: string }[] | null;
          const email = Array.isArray(userRelation) ? userRelation[0]?.email : userRelation?.email;
          return (
            <tr key={r.id} className="border-b border-gray-100">
              <td className="py-1 pr-3">{new Date(r.created_at).toLocaleString("fr-FR")}</td>
              <td className="py-1 pr-3">{formatNumber(r.amount)} FCFA</td>
              <td className="py-1 pr-3">{RECOVERY_SOURCE_LABELS[r.source] ?? r.source}</td>
              <td className="py-1">{email ?? "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function PurchaseLossesPage() {
  const { hasAttribution } = useAuth();
  const canManageRecovery = hasAttribution("transporteurs.gerer");
  const canWriteOff = hasAttribution("transporteurs.abandonner_creance");
  const { data: losses, isLoading, error } = useAllPurchaseLosses();
  const { data: recoveredTotals } = useAllPurchaseLossRecoveredTotals();
  const { data: writtenOffTotals } = useAllPurchaseLossWrittenOffTotals();
  const recordRecovery = useRecordPurchaseLossRecovery();
  const writeOffLoss = useWriteOffPurchaseLoss();
  const [recoveringId, setRecoveringId] = useState<string | null>(null);
  const [writingOffId, setWritingOffId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [writeOffError, setWriteOffError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RecoveryFormValues>({ resolver: zodResolver(recoverySchema) });

  const {
    control: writeOffControl,
    register: registerWriteOff,
    handleSubmit: handleWriteOffSubmit,
    reset: resetWriteOff,
    formState: { errors: writeOffErrors, isSubmitting: isWriteOffSubmitting },
  } = useForm<WriteOffFormValues>({ resolver: zodResolver(writeOffSchema) });

  function startRecovery(lossId: string) {
    setRecoveryError(null);
    setWritingOffId(null);
    setRecoveringId(recoveringId === lossId ? null : lossId);
    reset({ amount: undefined });
  }

  function startWriteOff(lossId: string, remaining: number) {
    setWriteOffError(null);
    setRecoveringId(null);
    setWritingOffId(writingOffId === lossId ? null : lossId);
    resetWriteOff({ amount: remaining, reason: "" });
  }

  async function onSubmitRecovery(lossId: string, values: RecoveryFormValues, remaining: number) {
    setRecoveryError(null);
    if (values.amount > remaining) {
      setRecoveryError(`Le montant dépasse le reste à recouvrer (${formatNumber(remaining)} FCFA).`);
      return;
    }
    try {
      await recordRecovery.mutateAsync({ lossId, amount: values.amount });
      setRecoveringId(null);
    } catch {
      setRecoveryError("Recouvrement refusé (droits insuffisants).");
    }
  }

  async function onSubmitWriteOff(lossId: string, values: WriteOffFormValues, remaining: number) {
    setWriteOffError(null);
    if (values.amount > remaining) {
      setWriteOffError(`Le montant dépasse le reste à recouvrer (${formatNumber(remaining)} FCFA).`);
      return;
    }
    try {
      await writeOffLoss.mutateAsync({ lossId, amount: values.amount, reason: values.reason });
      setWritingOffId(null);
    } catch {
      setWriteOffError("Passage en perte refusé (droits insuffisants).");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-forest-900">Pertes transport</h1>
        <p className="mt-1 text-sm text-gray-500">
          Pertes constatées à la réception des bons d'achat, avant l'entrée en stock —
          facturées en avoir au transporteur responsable (compte 4098, avoir à recevoir).
          Enregistrées depuis la page de détail d'un bon d'achat, au moment de la réception.
          Le recouvrement (remboursement effectif par le transporteur) se déclare ici et
          génère une écriture de trésorerie. Une créance qui ne sera jamais remboursée peut
          être passée en perte définitive (compte 654) — action distincte, réservée aux
          profils habilités séparément.
        </p>
      </div>

      <Card>
        {isLoading && <p className="text-sm text-gray-500">Chargement…</p>}
        {error && <p className="text-sm text-red-600">Impossible de charger les pertes.</p>}
        {losses && (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th scope="col" className="py-2">Date</th>
                <th scope="col" className="py-2">Transporteur</th>
                <th scope="col" className="py-2">Produit</th>
                <th scope="col" className="py-2">Quantité perdue</th>
                <th scope="col" className="py-2">Valeur</th>
                <th scope="col" className="py-2">Recouvrement</th>
                <th scope="col" className="py-2">Bon d'achat</th>
                <th scope="col" className="py-2" />
              </tr>
            </thead>
            <tbody>
              {losses.map((loss) => {
                const productRelation = loss.products as
                  { name: string; unit: string } | { name: string; unit: string }[] | null;
                const productInfo = Array.isArray(productRelation)
                  ? productRelation[0]
                  : productRelation;
                const transporterRelation = loss.transporters as
                  { id: string; name: string } | { id: string; name: string }[] | null;
                const transporter = Array.isArray(transporterRelation)
                  ? transporterRelation[0]
                  : transporterRelation;
                const totalValue = loss.quantity_lost * loss.unit_cost;
                const recoveredAmount = recoveredTotals?.get(loss.id) ?? 0;
                const writtenOffAmount = writtenOffTotals?.get(loss.id) ?? 0;
                const remaining = totalValue - recoveredAmount - writtenOffAmount;
                const status =
                  recoveredAmount <= 0 && writtenOffAmount <= 0
                    ? { label: "En attente", classes: "bg-amber-100 text-amber-700" }
                    : remaining > 0
                      ? { label: "Partiel", classes: "bg-blue-100 text-blue-700" }
                      : recoveredAmount >= totalValue
                        ? { label: "Recouvré", classes: "bg-green-100 text-green-700" }
                        : { label: "Passé en perte", classes: "bg-gray-200 text-gray-600" };
                const isRecovering = recoveringId === loss.id;
                const isWritingOff = writingOffId === loss.id;
                const isExpanded = expandedId === loss.id;
                return (
                  <Fragment key={loss.id}>
                    <tr className="border-b border-gray-100">
                      <td className="py-2">{new Date(loss.created_at).toLocaleString("fr-FR")}</td>
                      <td className="py-2">{transporter?.name ?? "—"}</td>
                      <td className="py-2">{productInfo?.name ?? "—"}</td>
                      <td className="py-2">
                        {loss.quantity_lost} {productInfo?.unit ?? ""}
                      </td>
                      <td className="py-2">{formatNumber(totalValue)} FCFA</td>
                      <td className="py-2">
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${status.classes}`}>
                          {status.label}
                        </span>
                        {(recoveredAmount > 0 || writtenOffAmount > 0) && (
                          <span className="ml-2 text-xs text-gray-500">
                            {formatNumber(recoveredAmount + writtenOffAmount)} /{" "}
                            {formatNumber(totalValue)} FCFA
                            {writtenOffAmount > 0 && ` (dont ${formatNumber(writtenOffAmount)} passé en perte)`}
                          </span>
                        )}
                      </td>
                      <td className="py-2">
                        <Link
                          to={`/purchases/${loss.purchase_id}`}
                          className="text-brand-600 hover:underline"
                        >
                          Voir le bon d'achat
                        </Link>
                      </td>
                      <td className="py-2 text-right">
                        <div className="flex justify-end gap-3">
                          <button
                            type="button"
                            className="text-xs text-gray-500 hover:underline"
                            onClick={() => setExpandedId(isExpanded ? null : loss.id)}
                          >
                            {isExpanded ? "Masquer" : "Détails"}
                          </button>
                          {canManageRecovery && remaining > 0 && (
                            <button
                              type="button"
                              className="text-xs text-brand-600 hover:underline"
                              onClick={() => startRecovery(loss.id)}
                            >
                              Recouvrement
                            </button>
                          )}
                          {canWriteOff && remaining > 0 && (
                            <button
                              type="button"
                              className="text-xs text-red-600 hover:underline"
                              onClick={() => startWriteOff(loss.id, remaining)}
                            >
                              Passer en perte
                            </button>
                          )}
                          <Button
                            variant="secondary"
                            onClick={() =>
                              void generateCreditNotePdf({
                                purchaseId: loss.purchase_id,
                                transporterName: transporter?.name ?? "—",
                                createdAt: loss.created_at,
                                items: [
                                  {
                                    productName: productInfo?.name ?? "Produit supprimé",
                                    quantityLost: loss.quantity_lost,
                                    unitCost: loss.unit_cost,
                                    unit: productInfo?.unit,
                                  },
                                ],
                              }).then(({ doc, filename }) => doc.save(filename))
                            }
                          >
                            Facture d'avoir (PDF)
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {isRecovering && (
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <td colSpan={8} className="py-2">
                          <form
                            onSubmit={handleSubmit((values) => onSubmitRecovery(loss.id, values, remaining))}
                            className="flex flex-wrap items-end gap-3 px-2"
                            noValidate
                          >
                            <div>
                              <label
                                htmlFor={`recovery-amount-${loss.id}`}
                                className="mb-1 block text-xs font-medium text-gray-600"
                              >
                                Montant recouvré (reste : {formatNumber(remaining)} FCFA)
                              </label>
                              <Controller
                                control={control}
                                name="amount"
                                render={({ field }) => (
                                  <AmountInput
                                    id={`recovery-amount-${loss.id}`}
                                    value={field.value}
                                    onChange={field.onChange}
                                    onBlur={field.onBlur}
                                  />
                                )}
                              />
                              {errors.amount && (
                                <p className="mt-1 text-xs text-red-600">{errors.amount.message}</p>
                              )}
                            </div>
                            <Button type="submit" disabled={isSubmitting}>
                              Enregistrer
                            </Button>
                            <Button type="button" variant="secondary" onClick={() => setRecoveringId(null)}>
                              Annuler
                            </Button>
                            {recoveryError && (
                              <p role="alert" className="w-full text-xs text-red-600">
                                {recoveryError}
                              </p>
                            )}
                          </form>
                        </td>
                      </tr>
                    )}
                    {isWritingOff && (
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <td colSpan={8} className="py-2">
                          <form
                            onSubmit={handleWriteOffSubmit((values) =>
                              onSubmitWriteOff(loss.id, values, remaining),
                            )}
                            className="flex flex-wrap items-end gap-3 px-2"
                            noValidate
                          >
                            <div>
                              <label
                                htmlFor={`writeoff-amount-${loss.id}`}
                                className="mb-1 block text-xs font-medium text-gray-600"
                              >
                                Montant passé en perte (reste : {formatNumber(remaining)} FCFA)
                              </label>
                              <Controller
                                control={writeOffControl}
                                name="amount"
                                render={({ field }) => (
                                  <AmountInput
                                    id={`writeoff-amount-${loss.id}`}
                                    value={field.value}
                                    onChange={field.onChange}
                                    onBlur={field.onBlur}
                                  />
                                )}
                              />
                              {writeOffErrors.amount && (
                                <p className="mt-1 text-xs text-red-600">{writeOffErrors.amount.message}</p>
                              )}
                            </div>
                            <div className="flex-1">
                              <label
                                htmlFor={`writeoff-reason-${loss.id}`}
                                className="mb-1 block text-xs font-medium text-gray-600"
                              >
                                Motif (obligatoire)
                              </label>
                              <input
                                id={`writeoff-reason-${loss.id}`}
                                type="text"
                                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                                placeholder="Ex. transporteur insolvable, créance abandonnée"
                                {...registerWriteOff("reason")}
                              />
                              {writeOffErrors.reason && (
                                <p className="mt-1 text-xs text-red-600">{writeOffErrors.reason.message}</p>
                              )}
                            </div>
                            <Button type="submit" variant="danger" disabled={isWriteOffSubmitting}>
                              Confirmer
                            </Button>
                            <Button type="button" variant="secondary" onClick={() => setWritingOffId(null)}>
                              Annuler
                            </Button>
                            {writeOffError && (
                              <p role="alert" className="w-full text-xs text-red-600">
                                {writeOffError}
                              </p>
                            )}
                          </form>
                        </td>
                      </tr>
                    )}
                    {isExpanded && (
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <td colSpan={8} className="py-2 pl-4">
                          {loss.reason && (
                            <p className="mb-2 text-xs text-gray-600">Motif : {loss.reason}</p>
                          )}
                          <RecoveryHistoryRows lossId={loss.id} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {losses.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-4 text-center text-gray-500">
                    Aucune perte enregistrée.
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
