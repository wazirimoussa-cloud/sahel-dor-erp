import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/auth/useAuth";
import { useCreateEmployee } from "@/features/payroll/useEmployees";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const employeeSchema = z.object({
  fullName: z.string().min(1, "Nom requis"),
  position: z.string().optional(),
  baseSalary: z.coerce.number().min(0, "Le salaire doit être positif"),
  familyDependents: z.coerce.number().int().min(0, "Le nombre de charges doit être positif"),
});

type EmployeeFormValues = z.infer<typeof employeeSchema>;

export function EmployeeForm({ onCreated }: { onCreated?: () => void }) {
  const { profile } = useAuth();
  const createEmployee = useCreateEmployee();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeSchema),
    defaultValues: { baseSalary: 0, familyDependents: 0 },
  });

  async function onSubmit(values: EmployeeFormValues) {
    if (!profile?.companyId) return;
    await createEmployee.mutateAsync({ ...values, companyId: profile.companyId });
    reset({ fullName: "", position: "", baseSalary: 0, familyDependents: 0 });
    onCreated?.();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-wrap items-end gap-3" noValidate>
      <div>
        <label htmlFor="employee-fullName" className="mb-1 block text-xs font-medium text-gray-600">
          Nom complet
        </label>
        <Input id="employee-fullName" {...register("fullName")} />
        {errors.fullName && <p className="mt-1 text-xs text-red-600">{errors.fullName.message}</p>}
      </div>
      <div>
        <label htmlFor="employee-position" className="mb-1 block text-xs font-medium text-gray-600">
          Poste
        </label>
        <Input id="employee-position" {...register("position")} />
      </div>
      <div>
        <label htmlFor="employee-baseSalary" className="mb-1 block text-xs font-medium text-gray-600">
          Salaire de base (FCFA)
        </label>
        <Input id="employee-baseSalary" type="number" step="0.01" {...register("baseSalary")} />
        {errors.baseSalary && <p className="mt-1 text-xs text-red-600">{errors.baseSalary.message}</p>}
      </div>
      <div>
        <label htmlFor="employee-familyDependents" className="mb-1 block text-xs font-medium text-gray-600">
          Charges de famille
        </label>
        <Input id="employee-familyDependents" type="number" step="1" {...register("familyDependents")} />
        {errors.familyDependents && (
          <p className="mt-1 text-xs text-red-600">{errors.familyDependents.message}</p>
        )}
      </div>
      <Button type="submit" disabled={isSubmitting}>
        Ajouter l'employé
      </Button>
    </form>
  );
}
