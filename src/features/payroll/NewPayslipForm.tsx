import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "react-router-dom";
import { useActiveEmployees } from "@/features/payroll/useEmployees";
import { useCreatePayslip } from "@/features/payroll/usePayslips";
import { useOutstandingAdvances } from "@/features/payroll/useSalaryAdvances";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { formatNumber } from "@/lib/format";

const payslipSchema = z.object({
  employeeId: z.string().uuid("Choisissez un employé"),
  period: z.string().min(1, "Mois requis"),
  grossSalary: z.coerce.number().positive("Le salaire brut doit être positif"),
  pensionWithholding: z.coerce.number().min(0, "La retenue doit être positive"),
  itsWithholding: z.coerce.number().min(0, "La retenue doit être positive"),
  advanceRepaidId: z.string().optional(),
});

type PayslipFormValues = z.infer<typeof payslipSchema>;

export function NewPayslipForm({ onCreated }: { onCreated?: () => void }) {
  const { data: employees } = useActiveEmployees();
  const createPayslip = useCreatePayslip();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<PayslipFormValues>({
    resolver: zodResolver(payslipSchema),
    defaultValues: { grossSalary: 0, pensionWithholding: 0, itsWithholding: 0, advanceRepaidId: "" },
  });

  const watched = watch();
  const { data: outstandingAdvances } = useOutstandingAdvances(watched.employeeId || undefined);
  const selectedAdvance = outstandingAdvances?.find((a) => a.id === watched.advanceRepaidId);
  const advanceAmount = selectedAdvance?.amount ?? 0;
  const netPay = watched.grossSalary - watched.pensionWithholding - watched.itsWithholding - advanceAmount;

  async function onSubmit(values: PayslipFormValues) {
    setServerError(null);
    try {
      await createPayslip.mutateAsync({ ...values, advanceRepaidId: values.advanceRepaidId || undefined });
      reset({
        employeeId: "",
        period: "",
        grossSalary: 0,
        pensionWithholding: 0,
        itsWithholding: 0,
        advanceRepaidId: "",
      });
      onCreated?.();
    } catch {
      setServerError(
        "Bulletin refusé (employé invalide, retenues supérieures au brut, avance déjà remboursée, ou rôle non autorisé).",
      );
    }
  }

  function handleEmployeeChange(employeeId: string) {
    const employee = employees?.find((e) => e.id === employeeId);
    if (employee) setValue("grossSalary", employee.base_salary);
    setValue("advanceRepaidId", "");
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
      <p className="text-xs text-gray-500">
        Les retenues pension et ITS sont saisies manuellement — voir le{" "}
        <Link to="/parametres-tva" className="underline">
          barème ITS de référence
        </Link>{" "}
        pour aider au calcul. L'app ne calcule rien automatiquement.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="payslip-employeeId" className="mb-1 block text-xs font-medium text-gray-600">
            Employé
          </label>
          <select
            id="payslip-employeeId"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            {...register("employeeId", { onChange: (e) => handleEmployeeChange(e.target.value) })}
          >
            <option value="">— Choisir —</option>
            {employees?.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.full_name}
              </option>
            ))}
          </select>
          {errors.employeeId && <p className="mt-1 text-xs text-red-600">{errors.employeeId.message}</p>}
        </div>
        <div>
          <label htmlFor="period" className="mb-1 block text-xs font-medium text-gray-600">
            Mois
          </label>
          <Input id="period" type="month" {...register("period")} />
          {errors.period && <p className="mt-1 text-xs text-red-600">{errors.period.message}</p>}
        </div>
        <div>
          <label htmlFor="grossSalary" className="mb-1 block text-xs font-medium text-gray-600">
            Salaire brut (FCFA)
          </label>
          <Input id="grossSalary" type="number" step="0.01" {...register("grossSalary")} />
          {errors.grossSalary && <p className="mt-1 text-xs text-red-600">{errors.grossSalary.message}</p>}
        </div>
        <div>
          <label htmlFor="pensionWithholding" className="mb-1 block text-xs font-medium text-gray-600">
            Retenue pension (FCFA)
          </label>
          <Input id="pensionWithholding" type="number" step="0.01" {...register("pensionWithholding")} />
          {errors.pensionWithholding && (
            <p className="mt-1 text-xs text-red-600">{errors.pensionWithholding.message}</p>
          )}
        </div>
        <div>
          <label htmlFor="itsWithholding" className="mb-1 block text-xs font-medium text-gray-600">
            Retenue ITS (FCFA)
          </label>
          <Input id="itsWithholding" type="number" step="0.01" {...register("itsWithholding")} />
          {errors.itsWithholding && (
            <p className="mt-1 text-xs text-red-600">{errors.itsWithholding.message}</p>
          )}
        </div>
        <div>
          <label htmlFor="advanceRepaidId" className="mb-1 block text-xs font-medium text-gray-600">
            Rembourser une avance
          </label>
          <select
            id="advanceRepaidId"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            {...register("advanceRepaidId")}
          >
            <option value="">— Aucune —</option>
            {outstandingAdvances?.map((advance) => (
              <option key={advance.id} value={advance.id}>
                {formatNumber(advance.amount)} FCFA ({new Date(advance.advance_date).toLocaleDateString("fr-FR")})
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">Remboursement intégral, pas de solde partiel.</p>
        </div>
      </div>
      <p className="text-sm font-semibold text-forest-900">
        Net à payer : {Number.isFinite(netPay) ? formatNumber(netPay) : "—"} FCFA
      </p>
      <Button type="submit" disabled={isSubmitting}>
        Créer le bulletin
      </Button>
      {serverError && (
        <p role="alert" className="text-sm text-red-600">
          {serverError}
        </p>
      )}
    </form>
  );
}
