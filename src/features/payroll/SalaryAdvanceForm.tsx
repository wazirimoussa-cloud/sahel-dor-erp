import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useActiveEmployees } from "@/features/payroll/useEmployees";
import { useCreateSalaryAdvance } from "@/features/payroll/useSalaryAdvances";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const advanceSchema = z.object({
  employeeId: z.string().uuid("Choisissez un employé"),
  amount: z.coerce.number().positive("Le montant doit être positif"),
  reason: z.string().optional(),
});

type AdvanceFormValues = z.infer<typeof advanceSchema>;

export function SalaryAdvanceForm({ onCreated }: { onCreated?: () => void }) {
  const { data: employees } = useActiveEmployees();
  const createAdvance = useCreateSalaryAdvance();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AdvanceFormValues>({ resolver: zodResolver(advanceSchema) });

  async function onSubmit(values: AdvanceFormValues) {
    setServerError(null);
    try {
      await createAdvance.mutateAsync(values);
      reset({ employeeId: "", amount: 0, reason: "" });
      onCreated?.();
    } catch {
      setServerError("Avance refusée (employé invalide, ou rôle non autorisé).");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-wrap items-end gap-3" noValidate>
      <div>
        <label htmlFor="advance-employeeId" className="mb-1 block text-xs font-medium text-gray-600">
          Employé
        </label>
        <select
          id="advance-employeeId"
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          {...register("employeeId")}
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
        <label htmlFor="advance-amount" className="mb-1 block text-xs font-medium text-gray-600">
          Montant (FCFA)
        </label>
        <Input id="advance-amount" type="number" step="0.01" {...register("amount")} />
        {errors.amount && <p className="mt-1 text-xs text-red-600">{errors.amount.message}</p>}
      </div>
      <div>
        <label htmlFor="advance-reason" className="mb-1 block text-xs font-medium text-gray-600">
          Motif (optionnel)
        </label>
        <Input id="advance-reason" {...register("reason")} />
      </div>
      <Button type="submit" disabled={isSubmitting}>
        Verser l'avance
      </Button>
      {serverError && (
        <p role="alert" className="text-sm text-red-600">
          {serverError}
        </p>
      )}
    </form>
  );
}
