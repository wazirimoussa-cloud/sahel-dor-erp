import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/auth/useAuth";
import { useActiveEmployees } from "@/features/payroll/useEmployees";
import { useCreateLeaveRecord, type LeaveType } from "@/features/payroll/useLeaveRecords";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  conge_paye: "Congé payé",
  maladie: "Maladie",
  absence_non_justifiee: "Absence non justifiée",
  autre: "Autre",
};

const leaveSchema = z
  .object({
    employeeId: z.string().uuid("Choisissez un employé"),
    type: z.enum(["conge_paye", "maladie", "absence_non_justifiee", "autre"]),
    startDate: z.string().min(1, "Date de début requise"),
    endDate: z.string().min(1, "Date de fin requise"),
    reason: z.string().optional(),
  })
  .refine((values) => values.endDate >= values.startDate, {
    message: "La date de fin doit être postérieure ou égale à la date de début",
    path: ["endDate"],
  });

type LeaveFormValues = z.infer<typeof leaveSchema>;

export function LeaveRecordForm({ onCreated }: { onCreated?: () => void }) {
  const { profile } = useAuth();
  const { data: employees } = useActiveEmployees();
  const createLeaveRecord = useCreateLeaveRecord();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<LeaveFormValues>({ resolver: zodResolver(leaveSchema) });

  async function onSubmit(values: LeaveFormValues) {
    if (!profile?.companyId) return;
    setServerError(null);
    try {
      await createLeaveRecord.mutateAsync({
        ...values,
        companyId: profile.companyId,
        userId: profile.id,
      });
      reset({ employeeId: "", type: "conge_paye", startDate: "", endDate: "", reason: "" });
      onCreated?.();
    } catch {
      setServerError("Enregistrement refusé (employé invalide, ou rôle non autorisé).");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-wrap items-end gap-3" noValidate>
      <div>
        <label htmlFor="leave-employeeId" className="mb-1 block text-xs font-medium text-gray-600">
          Employé
        </label>
        <select
          id="leave-employeeId"
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
        <label htmlFor="leave-type" className="mb-1 block text-xs font-medium text-gray-600">
          Type
        </label>
        <select
          id="leave-type"
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          {...register("type")}
        >
          {Object.entries(LEAVE_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="leave-startDate" className="mb-1 block text-xs font-medium text-gray-600">
          Début
        </label>
        <Input id="leave-startDate" type="date" {...register("startDate")} />
        {errors.startDate && <p className="mt-1 text-xs text-red-600">{errors.startDate.message}</p>}
      </div>
      <div>
        <label htmlFor="leave-endDate" className="mb-1 block text-xs font-medium text-gray-600">
          Fin
        </label>
        <Input id="leave-endDate" type="date" {...register("endDate")} />
        {errors.endDate && <p className="mt-1 text-xs text-red-600">{errors.endDate.message}</p>}
      </div>
      <div>
        <label htmlFor="leave-reason" className="mb-1 block text-xs font-medium text-gray-600">
          Motif (optionnel)
        </label>
        <Input id="leave-reason" {...register("reason")} />
      </div>
      <Button type="submit" disabled={isSubmitting}>
        Enregistrer
      </Button>
      {serverError && (
        <p role="alert" className="text-sm text-red-600">
          {serverError}
        </p>
      )}
    </form>
  );
}

export { LEAVE_TYPE_LABELS };
