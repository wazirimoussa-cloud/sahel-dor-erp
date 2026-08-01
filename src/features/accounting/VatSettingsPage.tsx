import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/auth/useAuth";
import { useCompanySettings, useUpdateVatRate } from "@/features/accounting/useCompanySettings";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const vatRateSchema = z.object({
  vatRate: z.coerce.number().min(0, "Le taux doit être positif").max(100, "Le taux ne peut pas dépasser 100%"),
});

type VatRateFormValues = z.infer<typeof vatRateSchema>;

export function VatSettingsPage() {
  const { hasAttribution } = useAuth();
  const { data: company, isLoading, error } = useCompanySettings();
  const updateVatRate = useUpdateVatRate();
  const canManage = hasAttribution("comptabilite.modifier_capital_social");
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<VatRateFormValues>({ resolver: zodResolver(vatRateSchema) });

  useEffect(() => {
    if (company) reset({ vatRate: company.vat_rate });
  }, [company, reset]);

  async function onSubmit(values: VatRateFormValues) {
    if (!company) return;
    setFormError(null);
    setSuccess(false);
    try {
      await updateVatRate.mutateAsync({ companyId: company.id, vatRate: values.vatRate });
      setSuccess(true);
    } catch {
      setFormError("Modification refusée (droits insuffisants).");
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-bold text-forest-900">Paramètres TVA</h1>
      <p className="text-sm text-gray-500">
        Taux de TVA appliqué aux produits non exonérés lors des achats, ventes et
        déclarations. Modifier ce taux n'affecte jamais les documents déjà émis —
        seules les prochaines opérations utilisent le nouveau taux.
      </p>

      <Card>
        {isLoading && <p className="text-sm text-gray-500">Chargement…</p>}
        {error && <p className="text-sm text-red-600">Impossible de charger les paramètres.</p>}
        {company && !canManage && (
          <p className="text-lg font-semibold text-forest-900">{company.vat_rate}%</p>
        )}
        {company && canManage && (
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-wrap items-end gap-3" noValidate>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Taux de TVA (%)</label>
              <Input type="number" step="0.01" {...register("vatRate")} />
              {errors.vatRate && <p className="mt-1 text-xs text-red-600">{errors.vatRate.message}</p>}
            </div>
            <Button type="submit" disabled={isSubmitting}>
              Enregistrer
            </Button>
            {success && <p className="text-xs text-green-600">Taux mis à jour.</p>}
            {formError && <p className="w-full text-xs text-red-600">{formError}</p>}
          </form>
        )}
      </Card>
    </div>
  );
}
