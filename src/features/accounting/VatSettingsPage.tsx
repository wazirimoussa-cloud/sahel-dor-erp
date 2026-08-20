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
import { formatNumber } from "@/lib/format";

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
  taxeProfessionnelleCaAnnuel: amountField,
  taxeProfessionnelleValeurLocative: amountField,
  irvmDividendesRate: percentField(),
  irvmPlusValuesCessionRate: percentField(),
  irvmObligationsRate: percentField(),
  droitsEnregistrementActesSociete: amountField,
  droitsEnregistrementFondsCommerceRate: percentField(),
  taxePublicitePanneauPapierRate: amountField,
  taxePublicitePanneauAutreRate: amountField,
  redevanceDomainePublicRate: amountField,
});

function computeTaxeProfessionnelle(values: {
  taxeProfessionnelleDroitFixePourMille: number;
  taxeProfessionnellePlancher: number;
  taxeProfessionnelleDroitProportionnelRate: number;
  taxeProfessionnelleCaAnnuel: number;
  taxeProfessionnelleValeurLocative: number;
}) {
  const droitFixe = Math.max(
    (values.taxeProfessionnelleCaAnnuel * values.taxeProfessionnelleDroitFixePourMille) / 1000,
    values.taxeProfessionnellePlancher,
  );
  const droitProportionnel = (values.taxeProfessionnelleValeurLocative * values.taxeProfessionnelleDroitProportionnelRate) / 100;
  return { droitFixe, droitProportionnel, total: droitFixe + droitProportionnel };
}

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

const TAXE_PROFESSIONNELLE_DATA_FIELDS: {
  name: keyof FiscalRatesFormValues;
  column: keyof Pick<CompanyRow, "taxe_professionnelle_ca_annuel" | "taxe_professionnelle_valeur_locative">;
  label: string;
  suffix: string;
  help: string;
}[] = [
  {
    name: "taxeProfessionnelleCaAnnuel",
    column: "taxe_professionnelle_ca_annuel",
    label: "Chiffre d'affaires de l'exercice précédent",
    suffix: "FCFA",
    help: "Saisie manuelle — assiette du droit fixe (Art. 175 CGI).",
  },
  {
    name: "taxeProfessionnelleValeurLocative",
    column: "taxe_professionnelle_valeur_locative",
    label: "Valeur locative des locaux",
    suffix: "FCFA",
    help: "Saisie manuelle, montant global pour la société — assiette du droit proportionnel (Art. 176 CGI).",
  },
];

const IRVM_FIELDS: {
  name: keyof FiscalRatesFormValues;
  column: keyof Pick<
    CompanyRow,
    "irvm_dividendes_rate" | "irvm_plus_values_cession_rate" | "irvm_obligations_rate"
  >;
  label: string;
  suffix: string;
  help: string;
}[] = [
  {
    name: "irvmDividendesRate",
    column: "irvm_dividendes_rate",
    label: "Dividendes",
    suffix: "%",
    help: "10% (7% seulement si la société est cotée sur une bourse agréée CREPMF/UEMOA — non pertinent pour une SARL non cotée). Art. 74 CGI.",
  },
  {
    name: "irvmPlusValuesCessionRate",
    column: "irvm_plus_values_cession_rate",
    label: "Plus-values de cession de parts",
    suffix: "%",
    help: "7% sur les plus-values de cession d'actions et parts sociales (Art. 74 CGI).",
  },
  {
    name: "irvmObligationsRate",
    column: "irvm_obligations_rate",
    label: "Revenus d'obligations",
    suffix: "%",
    help: "6% sur les revenus d'obligations (Art. 74 CGI).",
  },
];

const DROITS_ENREGISTREMENT_FIELDS: {
  name: keyof FiscalRatesFormValues;
  column: keyof Pick<CompanyRow, "droits_enregistrement_actes_societe" | "droits_enregistrement_fonds_commerce_rate">;
  label: string;
  suffix: string;
  help: string;
}[] = [
  {
    name: "droitsEnregistrementActesSociete",
    column: "droits_enregistrement_actes_societe",
    label: "Actes de société (droit fixe)",
    suffix: "FCFA",
    help: "Constitution, augmentation de capital, fusion, cession d'actions/parts — droit fixe, quel que soit le montant de l'acte (Art. 489 CGI).",
  },
  {
    name: "droitsEnregistrementFondsCommerceRate",
    column: "droits_enregistrement_fonds_commerce_rate",
    label: "Cession de fonds de commerce",
    suffix: "%",
    help: "Rachat/revente d'un commerce complet (pas une opération d'achat-revente de stock classique).",
  },
];

const TAXE_PUBLICITE_FIELDS: {
  name: keyof FiscalRatesFormValues;
  column: keyof Pick<CompanyRow, "taxe_publicite_panneau_papier_rate" | "taxe_publicite_panneau_autre_rate">;
  label: string;
  suffix: string;
  help: string;
}[] = [
  {
    name: "taxePublicitePanneauPapierRate",
    column: "taxe_publicite_panneau_papier_rate",
    label: "Panneau — papier ordinaire",
    suffix: "FCFA / m² / an",
    help: "Papier non protégé (Art. 24 CGI, taxe communale — pas d'écriture comptable automatique).",
  },
  {
    name: "taxePublicitePanneauAutreRate",
    column: "taxe_publicite_panneau_autre_rate",
    label: "Panneau — autre matériau",
    suffix: "FCFA / m² / an",
    help: "Toile, bois, porcelaine, banderole, véhicule publicitaire (Art. 24 CGI).",
  },
];

// ITS (Art. 50-68 CGI) : barème légal fixe, identique pour toute société —
// contrairement au reste de l'écran, ce n'est pas une donnée propre à Sahel
// d'Or et il n'y a donc pas de champ éditable en base. Un vrai calcul
// suppose un module paie (employés, salaire mensuel, charges de famille)
// que l'app ne modélise pas — décision confirmée avec l'utilisateur de
// laisser RH hors périmètre. Ce tableau est une référence de consultation
// uniquement.
const ITS_BAREME: { tranche: string; taux: string }[] = [
  { tranche: "0 à 25 000 FCFA", taux: "1%" },
  { tranche: "25 001 à 50 000 FCFA", taux: "2%" },
  { tranche: "50 001 à 100 000 FCFA", taux: "6%" },
  { tranche: "100 001 à 150 000 FCFA", taux: "13%" },
  { tranche: "150 001 à 300 000 FCFA", taux: "25%" },
  { tranche: "300 001 à 400 000 FCFA", taux: "30%" },
  { tranche: "400 001 à 700 000 FCFA", taux: "32%" },
  { tranche: "700 001 à 1 000 000 FCFA", taux: "34%" },
  { tranche: "Au-delà de 1 000 000 FCFA", taux: "35%" },
];

const ITS_ABATTEMENTS_FAMILLE: { charges: string; abattement: string }[] = [
  { charges: "0 charge", abattement: "0%" },
  { charges: "1 charge", abattement: "5%" },
  { charges: "2 charges", abattement: "10%" },
  { charges: "3 charges", abattement: "12%" },
  { charges: "4 charges", abattement: "13%" },
  { charges: "5 charges", abattement: "14%" },
  { charges: "6 charges", abattement: "15%" },
  { charges: "7 charges", abattement: "30%" },
];

const DROITS_FONCIERS_FIELDS: {
  name: keyof FiscalRatesFormValues;
  column: keyof Pick<CompanyRow, "redevance_domaine_public_rate">;
  label: string;
  suffix: string;
  help: string;
}[] = [
  {
    name: "redevanceDomainePublicRate",
    column: "redevance_domaine_public_rate",
    label: "Occupation du domaine public — usage commercial",
    suffix: "FCFA / m² / an",
    help: "Redevance annuelle pour occupation d'un terrain du domaine public à usage commercial (Art. 914 CGI).",
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
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FiscalRatesFormValues>({ resolver: zodResolver(fiscalRatesSchema) });

  const watched = watch();
  const estimation = computeTaxeProfessionnelle(watched);

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
        taxeProfessionnelleCaAnnuel: company.taxe_professionnelle_ca_annuel,
        taxeProfessionnelleValeurLocative: company.taxe_professionnelle_valeur_locative,
        irvmDividendesRate: company.irvm_dividendes_rate,
        irvmPlusValuesCessionRate: company.irvm_plus_values_cession_rate,
        irvmObligationsRate: company.irvm_obligations_rate,
        droitsEnregistrementActesSociete: company.droits_enregistrement_actes_societe,
        droitsEnregistrementFondsCommerceRate: company.droits_enregistrement_fonds_commerce_rate,
        taxePublicitePanneauPapierRate: company.taxe_publicite_panneau_papier_rate,
        taxePublicitePanneauAutreRate: company.taxe_publicite_panneau_autre_rate,
        redevanceDomainePublicRate: company.redevance_domaine_public_rate,
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
        <h2 className="mb-1 text-sm font-bold text-forest-900">
          Impôt sur les Traitements et Salaires (ITS) — barème de référence
        </h2>
        <p className="mb-4 text-xs text-gray-500">
          Barème légal fixe (Art. 50-68 CGI), consultable uniquement — aucun champ
          éditable, aucun calcul automatique. Un vrai calcul suppose un module paie
          (employés, salaire mensuel, charges de famille) que l'app ne suit pas
          actuellement.
        </p>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <h3 className="mb-2 text-xs font-semibold text-gray-600">
              Barème progressif mensuel (Art. 66)
            </h3>
            <table className="w-full text-sm">
              <tbody>
                {ITS_BAREME.map((row) => (
                  <tr key={row.tranche} className="border-b border-gray-100">
                    <td className="py-1 pr-3 text-gray-700">{row.tranche}</td>
                    <td className="py-1 text-right font-semibold text-forest-900">{row.taux}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold text-gray-600">
              Abattement selon charges de famille (Art. 65)
            </h3>
            <table className="w-full text-sm">
              <tbody>
                {ITS_ABATTEMENTS_FAMILLE.map((row) => (
                  <tr key={row.charges} className="border-b border-gray-100">
                    <td className="py-1 pr-3 text-gray-700">{row.charges}</td>
                    <td className="py-1 text-right font-semibold text-forest-900">{row.abattement}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

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
              {TAXE_PROFESSIONNELLE_DATA_FIELDS.map((field) => (
                <div key={field.name}>
                  <dt className="text-xs font-medium text-gray-500">{field.label}</dt>
                  <dd className="text-lg font-semibold text-forest-900">
                    {formatNumber(company[field.column])} {field.suffix}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 border-t border-gray-100 pt-4">
              <p className="text-xs font-medium text-gray-500">Montant estimé (référence, non déclaratif)</p>
              <p className="text-lg font-semibold text-forest-900">
                {formatNumber(computeTaxeProfessionnelle({
                  taxeProfessionnelleDroitFixePourMille: company.taxe_professionnelle_droit_fixe_pour_mille,
                  taxeProfessionnellePlancher: company.taxe_professionnelle_plancher,
                  taxeProfessionnelleDroitProportionnelRate: company.taxe_professionnelle_droit_proportionnel_rate,
                  taxeProfessionnelleCaAnnuel: company.taxe_professionnelle_ca_annuel,
                  taxeProfessionnelleValeurLocative: company.taxe_professionnelle_valeur_locative,
                }).total)}{" "}
                FCFA
              </p>
            </div>
          </Card>
          <Card>
            <h2 className="mb-1 text-sm font-bold text-forest-900">
              Impôt sur le Revenu des Valeurs Mobilières (IRVM)
            </h2>
            <p className="mb-4 text-xs text-gray-500">
              Ne s'applique qu'en cas de distribution de dividendes ou de cession de parts —
              événement rare pour une SARL non cotée (Art. 70-78 CGI).
            </p>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {IRVM_FIELDS.map((field) => (
                <div key={field.name}>
                  <dt className="text-xs font-medium text-gray-500">{field.label}</dt>
                  <dd className="text-lg font-semibold text-forest-900">
                    {company[field.column]}
                    {field.suffix}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card>
            <h2 className="mb-1 text-sm font-bold text-forest-900">Droits d'enregistrement</h2>
            <p className="mb-4 text-xs text-gray-500">
              Le tarif complet couvre des dizaines de natures d'actes (successions,
              immeubles, jugements...) hors sujet pour une SARL commerciale — seuls les
              2 cas pertinents pour Sahel d'Or sont repris ici (Livre III CGI).
            </p>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {DROITS_ENREGISTREMENT_FIELDS.map((field) => (
                <div key={field.name}>
                  <dt className="text-xs font-medium text-gray-500">{field.label}</dt>
                  <dd className="text-lg font-semibold text-forest-900">
                    {formatNumber(company[field.column])} {field.suffix}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card>
            <h2 className="mb-1 text-sm font-bold text-forest-900">Taxe sur la publicité commerciale extérieure</h2>
            <p className="mb-4 text-xs text-gray-500">
              Taxe communale à 5 tarifs selon le support (prospectus, panneaux, annonces
              lumineuses, projections, haut-parleurs) — seul le cas le plus courant pour
              un commerce, le panneau/enseigne extérieure, est repris ici (Art. 23-24 CGI).
            </p>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {TAXE_PUBLICITE_FIELDS.map((field) => (
                <div key={field.name}>
                  <dt className="text-xs font-medium text-gray-500">{field.label}</dt>
                  <dd className="text-lg font-semibold text-forest-900">
                    {formatNumber(company[field.column])} {field.suffix}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card>
            <h2 className="mb-1 text-sm font-bold text-forest-900">Droits fonciers</h2>
            <p className="mb-4 text-xs text-gray-500">
              Surtout une grille de prix d'acquisition de terrain domanial (dizaines de
              villes/zones) hors sujet ici — seul le cas pertinent pour Sahel d'Or est
              repris (Livre foncier CGI).
            </p>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {DROITS_FONCIERS_FIELDS.map((field) => (
                <div key={field.name}>
                  <dt className="text-xs font-medium text-gray-500">{field.label}</dt>
                  <dd className="text-lg font-semibold text-forest-900">
                    {formatNumber(company[field.column])} {field.suffix}
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
                  <label htmlFor={field.name} className="mb-1 block text-xs font-medium text-gray-600">
                    {field.label} ({field.suffix})
                  </label>
                  <Input id={field.name} type="number" step="0.01" {...register(field.name)} />
                  <p className="mt-1 text-xs text-gray-500">{field.help}</p>
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
              Pas un taux unique : droit fixe + droit proportionnel (Art. 174 CGI). Le
              montant estimé ci-dessous est une référence de calcul, pas une écriture
              comptable ni une déclaration — à faire valider par un comptable.
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {TAXE_PROFESSIONNELLE_FIELDS.map((field) => (
                <div key={field.name}>
                  <label htmlFor={field.name} className="mb-1 block text-xs font-medium text-gray-600">
                    {field.label} ({field.suffix})
                  </label>
                  <Input id={field.name} type="number" step="0.01" {...register(field.name)} />
                  <p className="mt-1 text-xs text-gray-500">{field.help}</p>
                  {errors[field.name] && (
                    <p className="mt-1 text-xs text-red-600">{errors[field.name]?.message}</p>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {TAXE_PROFESSIONNELLE_DATA_FIELDS.map((field) => (
                <div key={field.name}>
                  <label htmlFor={field.name} className="mb-1 block text-xs font-medium text-gray-600">
                    {field.label} ({field.suffix})
                  </label>
                  <Input id={field.name} type="number" step="0.01" {...register(field.name)} />
                  <p className="mt-1 text-xs text-gray-500">{field.help}</p>
                  {errors[field.name] && (
                    <p className="mt-1 text-xs text-red-600">{errors[field.name]?.message}</p>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-4 border-t border-gray-100 pt-4">
              <p className="text-xs font-medium text-gray-500">Montant estimé (référence, non déclaratif)</p>
              <p className="text-lg font-semibold text-forest-900">
                {Number.isFinite(estimation.total) ? formatNumber(estimation.total) : "—"} FCFA
              </p>
            </div>
          </Card>

          <Card>
            <h2 className="mb-1 text-sm font-bold text-forest-900">
              Impôt sur le Revenu des Valeurs Mobilières (IRVM)
            </h2>
            <p className="mb-4 text-xs text-gray-500">
              Ne s'applique qu'en cas de distribution de dividendes ou de cession de parts —
              événement rare pour une SARL non cotée (Art. 70-78 CGI).
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {IRVM_FIELDS.map((field) => (
                <div key={field.name}>
                  <label htmlFor={field.name} className="mb-1 block text-xs font-medium text-gray-600">
                    {field.label} ({field.suffix})
                  </label>
                  <Input id={field.name} type="number" step="0.01" {...register(field.name)} />
                  <p className="mt-1 text-xs text-gray-500">{field.help}</p>
                  {errors[field.name] && (
                    <p className="mt-1 text-xs text-red-600">{errors[field.name]?.message}</p>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h2 className="mb-1 text-sm font-bold text-forest-900">Droits d'enregistrement</h2>
            <p className="mb-4 text-xs text-gray-500">
              Le tarif complet couvre des dizaines de natures d'actes (successions,
              immeubles, jugements...) hors sujet pour une SARL commerciale — seuls les
              2 cas pertinents pour Sahel d'Or sont repris ici (Livre III CGI).
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {DROITS_ENREGISTREMENT_FIELDS.map((field) => (
                <div key={field.name}>
                  <label htmlFor={field.name} className="mb-1 block text-xs font-medium text-gray-600">
                    {field.label} ({field.suffix})
                  </label>
                  <Input id={field.name} type="number" step="0.01" {...register(field.name)} />
                  <p className="mt-1 text-xs text-gray-500">{field.help}</p>
                  {errors[field.name] && (
                    <p className="mt-1 text-xs text-red-600">{errors[field.name]?.message}</p>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h2 className="mb-1 text-sm font-bold text-forest-900">Taxe sur la publicité commerciale extérieure</h2>
            <p className="mb-4 text-xs text-gray-500">
              Taxe communale à 5 tarifs selon le support (prospectus, panneaux, annonces
              lumineuses, projections, haut-parleurs) — seul le cas le plus courant pour
              un commerce, le panneau/enseigne extérieure, est repris ici (Art. 23-24 CGI).
              L'app ne suit pas la surface réelle des panneaux (à multiplier manuellement).
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {TAXE_PUBLICITE_FIELDS.map((field) => (
                <div key={field.name}>
                  <label htmlFor={field.name} className="mb-1 block text-xs font-medium text-gray-600">
                    {field.label} ({field.suffix})
                  </label>
                  <Input id={field.name} type="number" step="0.01" {...register(field.name)} />
                  <p className="mt-1 text-xs text-gray-500">{field.help}</p>
                  {errors[field.name] && (
                    <p className="mt-1 text-xs text-red-600">{errors[field.name]?.message}</p>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h2 className="mb-1 text-sm font-bold text-forest-900">Droits fonciers</h2>
            <p className="mb-4 text-xs text-gray-500">
              Surtout une grille de prix d'acquisition de terrain domanial (dizaines de
              villes/zones, Art. 912) hors sujet ici — seul le cas pertinent pour Sahel
              d'Or est repris (Livre foncier CGI). L'app ne suit pas la surface réellement
              occupée (à multiplier manuellement).
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {DROITS_FONCIERS_FIELDS.map((field) => (
                <div key={field.name}>
                  <label htmlFor={field.name} className="mb-1 block text-xs font-medium text-gray-600">
                    {field.label} ({field.suffix})
                  </label>
                  <Input id={field.name} type="number" step="0.01" {...register(field.name)} />
                  <p className="mt-1 text-xs text-gray-500">{field.help}</p>
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
            {success && (
              <p role="status" className="text-xs text-green-600">
                Taux mis à jour.
              </p>
            )}
            {formError && (
              <p role="alert" className="text-xs text-red-600">
                {formError}
              </p>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
