import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/auth/useAuth";
import { useCompanySettings, useUpdateFiscalRates } from "@/features/accounting/useCompanySettings";
import type { Tables } from "@/lib/database.types";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const rateField = z.coerce.number().min(0, "Le taux doit être positif").max(100, "Le taux ne peut pas dépasser 100%");

const fiscalRatesSchema = z.object({
  vatRate: rateField,
  impotSocietesRate: rateField,
  taxeProfessionnelleRate: rateField,
  precompteIsbRate: rateField,
  taxeImmobiliereRate: rateField,
});

type FiscalRatesFormValues = z.infer<typeof fiscalRatesSchema>;

type CompanyRow = Tables<"companies">;

const RATE_FIELDS: {
  name: keyof FiscalRatesFormValues;
  column: keyof Pick<
    CompanyRow,
    "vat_rate" | "impot_societes_rate" | "taxe_professionnelle_rate" | "precompte_isb_rate" | "taxe_immobiliere_rate"
  >;
  label: string;
  help: string;
}[] = [
  {
    name: "vatRate",
    column: "vat_rate",
    label: "TVA (%)",
    help: "Appliquée aux produits non exonérés lors des achats, ventes et déclarations.",
  },
  {
    name: "impotSocietesRate",
    column: "impot_societes_rate",
    label: "Impôt sur les Sociétés — IS (%)",
    help: "Taux annuel sur le bénéfice. Compte 695, aucun calcul automatique.",
  },
  {
    name: "taxeProfessionnelleRate",
    column: "taxe_professionnelle_rate",
    label: "Taxe professionnelle — patente (%)",
    help: "Compte 646, aucun calcul automatique.",
  },
  {
    name: "precompteIsbRate",
    column: "precompte_isb_rate",
    label: "Précompte ISB/IBA (%)",
    help: "Le taux dépend du statut du fournisseur (immatriculé ou non). Compte 4494, aucun calcul automatique.",
  },
  {
    name: "taxeImmobiliereRate",
    column: "taxe_immobiliere_rate",
    label: "Taxe immobilière (%)",
    help: "Le taux dépend de la catégorie du bien. Compte 647, aucun calcul automatique.",
  },
];

export function VatSettingsPage() {
  const { hasAttribution } = useAuth();
  const { data: company, isLoading, error } = useCompanySettings();
  const updateFiscalRates = useUpdateFiscalRates();
  const canManage = hasAttribution("comptabilite.modifier_capital_social");
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FiscalRatesFormValues>({ resolver: zodResolver(fiscalRatesSchema) });

  useEffect(() => {
    if (company) {
      reset({
        vatRate: company.vat_rate,
        impotSocietesRate: company.impot_societes_rate,
        taxeProfessionnelleRate: company.taxe_professionnelle_rate,
        precompteIsbRate: company.precompte_isb_rate,
        taxeImmobiliereRate: company.taxe_immobiliere_rate,
      });
    }
  }, [company, reset]);

  async function onSubmit(values: FiscalRatesFormValues) {
    if (!company) return;
    setFormError(null);
    setSuccess(false);
    try {
      await updateFiscalRates.mutateAsync({ companyId: company.id, rates: values });
      setSuccess(true);
    } catch {
      setFormError("Modification refusée (droits insuffisants).");
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-bold text-forest-900">Paramètres fiscaux</h1>
      <p className="text-sm text-gray-500">
        Taux appliqués aux calculs et déclarations de la société. Modifier un taux
        n'affecte jamais les documents déjà émis — seules les prochaines opérations
        utilisent le nouveau taux. En dehors de la TVA, ces taux sont des références
        de calcul manuel : aucune écriture comptable n'est encore générée
        automatiquement à partir d'eux.
      </p>

      <Card>
        {isLoading && <p className="text-sm text-gray-500">Chargement…</p>}
        {error && <p className="text-sm text-red-600">Impossible de charger les paramètres.</p>}
        {company && !canManage && (
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {RATE_FIELDS.map((field) => (
              <div key={field.name}>
                <dt className="text-xs font-medium text-gray-500">{field.label}</dt>
                <dd className="text-lg font-semibold text-forest-900">{company[field.column]}%</dd>
              </div>
            ))}
          </dl>
        )}
        {company && canManage && (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {RATE_FIELDS.map((field) => (
                <div key={field.name}>
                  <label className="mb-1 block text-xs font-medium text-gray-600">{field.label}</label>
                  <Input type="number" step="0.01" {...register(field.name)} />
                  <p className="mt-1 text-xs text-gray-400">{field.help}</p>
                  {errors[field.name] && (
                    <p className="mt-1 text-xs text-red-600">{errors[field.name]?.message}</p>
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={isSubmitting}>
                Enregistrer
              </Button>
              {success && <p className="text-xs text-green-600">Taux mis à jour.</p>}
              {formError && <p className="text-xs text-red-600">{formError}</p>}
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
