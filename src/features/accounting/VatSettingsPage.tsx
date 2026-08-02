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

const percentField = (max = 100) =>
  z.coerce.number().min(0, "Le taux doit être positif").max(max, `Le taux ne peut pas dépasser ${max}${max === 100 ? "%" : "‰"}`);
const amountField = z.coerce.number().min(0, "Le montant doit être positif");

const fiscalRatesSchema = z.object({
  vatRate: percentField(),
  impotSocietesRate: percentField(),
  precompteIsbRate: percentField(),
  taxeImmobiliereRate: percentField(),
  taxeProfessionnelleDroitFixePourMille: percentField(50),
  taxeProfessionnellePlancher: amountField,
  taxeProfessionnelleDroitProportionnelRate: percentField(),
});

type FiscalRatesFormValues = z.infer<typeof fiscalRatesSchema>;

type CompanyRow = Tables<"companies">;

const RATE_FIELDS: {
  name: keyof FiscalRatesFormValues;
  column: keyof Pick<CompanyRow, "vat_rate" | "impot_societes_rate" | "precompte_isb_rate" | "taxe_immobiliere_rate">;
  label: string;
  suffix: string;
  help: string;
}[] = [
  {
    name: "vatRate",
    column: "vat_rate",
    label: "TVA",
    suffix: "%",
    help: "Appliquée aux produits non exonérés lors des achats, ventes et déclarations.",
  },
  {
    name: "impotSocietesRate",
    column: "impot_societes_rate",
    label: "Impôt sur les Sociétés — IS",
    suffix: "%",
    help: "30% du bénéfice net imposable, sans abattement (Art. 27 CGI). Compte 695, aucun calcul automatique.",
  },
  {
    name: "precompteIsbRate",
    column: "precompte_isb_rate",
    label: "Précompte ISB",
    suffix: "%",
    help: "2% marché intérieur (opérateur immatriculé) par défaut ; l'Art. 40 CGI prévoit aussi 4% (douane/port) et 7% (opérateur non immatriculé) — à ajuster au cas par cas. Compte 4494, aucun calcul automatique.",
  },
  {
    name: "taxeImmobiliereRate",
    column: "taxe_immobiliere_rate",
    label: "Taxe immobilière",
    suffix: "%",
    help: "1% de la valeur des immobilisations pour une personne morale (Art. 155 CGI). Compte 647, aucun calcul automatique.",
  },
];

const TAXE_PROFESSIONNELLE_FIELDS: {
  name: keyof FiscalRatesFormValues;
  column: keyof Pick<
    CompanyRow,
    | "taxe_professionnelle_droit_fixe_pour_mille"
    | "taxe_professionnelle_plancher"
    | "taxe_professionnelle_droit_proportionnel_rate"
  >;
  label: string;
  suffix: string;
  help: string;
}[] = [
  {
    name: "taxeProfessionnelleDroitFixePourMille",
    column: "taxe_professionnelle_droit_fixe_pour_mille",
    label: "Droit fixe",
    suffix: "‰ du CA",
    help: "1‰ du chiffre d'affaires de l'année précédente (Art. 175 CGI).",
  },
  {
    name: "taxeProfessionnellePlancher",
    column: "taxe_professionnelle_plancher",
    label: "Plancher du droit fixe",
    suffix: "FCFA",
    help: "Le droit fixe ne peut jamais être inférieur à ce montant (Art. 175 CGI).",
  },
  {
    name: "taxeProfessionnelleDroitProportionnelRate",
    column: "taxe_professionnelle_droit_proportionnel_rate",
    label: "Droit proportionnel",
    suffix: "% de la valeur locative",
    help: "10% de la valeur locative des locaux professionnels (Art. 176 CGI).",
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
        precompteIsbRate: company.precompte_isb_rate,
        taxeImmobiliereRate: company.taxe_immobiliere_rate,
        taxeProfessionnelleDroitFixePourMille: company.taxe_professionnelle_droit_fixe_pour_mille,
        taxeProfessionnellePlancher: company.taxe_professionnelle_plancher,
        taxeProfessionnelleDroitProportionnelRate: company.taxe_professionnelle_droit_proportionnel_rate,
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

      {isLoading && <p className="text-sm text-gray-500">Chargement…</p>}
      {error && <p className="text-sm text-red-600">Impossible de charger les paramètres.</p>}

      {company && !canManage && (
        <>
          <Card>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {RATE_FIELDS.map((field) => (
                <div key={field.name}>
                  <dt className="text-xs font-medium text-gray-500">
                    {field.label} ({field.suffix})
                  </dt>
                  <dd className="text-lg font-semibold text-forest-900">
                    {company[field.column]}
                    {field.suffix}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card>
            <h2 className="mb-1 text-sm font-bold text-forest-900">Taxe professionnelle (patente)</h2>
            <p className="mb-4 text-xs text-gray-500">
              Pas un taux unique : droit fixe + droit proportionnel (Art. 174 CGI).
            </p>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {TAXE_PROFESSIONNELLE_FIELDS.map((field) => (
                <div key={field.name}>
                  <dt className="text-xs font-medium text-gray-500">{field.label}</dt>
                  <dd className="text-lg font-semibold text-forest-900">
                    {company[field.column]} {field.suffix}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
        </>
      )}

      {company && canManage && (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
          <Card>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {RATE_FIELDS.map((field) => (
                <div key={field.name}>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    {field.label} ({field.suffix})
                  </label>
                  <Input type="number" step="0.01" {...register(field.name)} />
                  <p className="mt-1 text-xs text-gray-400">{field.help}</p>
                  {errors[field.name] && (
                    <p className="mt-1 text-xs text-red-600">{errors[field.name]?.message}</p>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h2 className="mb-1 text-sm font-bold text-forest-900">Taxe professionnelle (patente)</h2>
            <p className="mb-4 text-xs text-gray-500">
              Pas un taux unique : droit fixe + droit proportionnel (Art. 174 CGI). Ces 3
              constantes légales sont des références de calcul manuel — l'app ne suit ni le
              chiffre d'affaires annuel ni la valeur locative des locaux nécessaires pour
              produire un montant réel.
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {TAXE_PROFESSIONNELLE_FIELDS.map((field) => (
                <div key={field.name}>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    {field.label} ({field.suffix})
                  </label>
                  <Input type="number" step="0.01" {...register(field.name)} />
                  <p className="mt-1 text-xs text-gray-400">{field.help}</p>
                  {errors[field.name] && (
                    <p className="mt-1 text-xs text-red-600">{errors[field.name]?.message}</p>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={isSubmitting}>
              Enregistrer
            </Button>
            {success && <p className="text-xs text-green-600">Taux mis à jour.</p>}
            {formError && <p className="text-xs text-red-600">{formError}</p>}
          </div>
        </form>
      )}
    </div>
  );
}
