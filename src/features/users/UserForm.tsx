import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCompanies, useCreateUser } from "@/features/users/useUsers";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const userSchema = z.object({
  email: z.string().email("Adresse email invalide"),
  role: z.enum(["admin", "manager", "seller", "auditor"]),
  companyId: z.string().uuid("Choisissez une société"),
});

type UserFormValues = z.infer<typeof userSchema>;

export function UserForm({ onCreated }: { onCreated?: () => void }) {
  const { data: companies } = useCompanies();
  const createUser = useCreateUser();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UserFormValues>({
    resolver: zodResolver(userSchema),
    defaultValues: { role: "seller" },
  });

  async function onSubmit(values: UserFormValues) {
    setServerError(null);
    try {
      await createUser.mutateAsync(values);
      reset({ role: "seller", email: "", companyId: values.companyId });
      onCreated?.();
    } catch {
      setServerError("Création refusée (email déjà utilisé, ou droits insuffisants).");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
      <p className="text-xs text-gray-500">
        Le compte est créé avec le mot de passe par défaut ; l'utilisateur devra le
        changer dès sa première connexion.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Email</label>
          <Input type="email" {...register("email")} />
          {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Rôle</label>
          <select className="rounded-md border border-gray-300 px-3 py-2 text-sm" {...register("role")}>
            <option value="admin">Admin</option>
            <option value="manager">Manager</option>
            <option value="seller">Vendeur</option>
            <option value="auditor">Auditeur</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Société</label>
          <select
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            {...register("companyId")}
          >
            <option value="">— Choisir —</option>
            {companies?.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
          {errors.companyId && <p className="mt-1 text-xs text-red-600">{errors.companyId.message}</p>}
        </div>

        <Button type="submit" disabled={isSubmitting}>
          Créer l'utilisateur
        </Button>
      </div>

      {serverError && <p className="text-xs text-red-600">{serverError}</p>}
    </form>
  );
}
