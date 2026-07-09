import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/auth/useAuth";
import { useCreateAccount } from "@/features/accounting/useChartOfAccounts";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const accountSchema = z.object({
  code: z.string().min(1, "Code requis"),
  name: z.string().min(1, "Nom requis"),
});

type AccountFormValues = z.infer<typeof accountSchema>;

export function ChartOfAccountForm({ onCreated }: { onCreated?: () => void }) {
  const { profile } = useAuth();
  const createAccount = useCreateAccount();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AccountFormValues>({ resolver: zodResolver(accountSchema) });

  async function onSubmit(values: AccountFormValues) {
    if (!profile?.companyId) return;
    await createAccount.mutateAsync({ ...values, companyId: profile.companyId });
    reset();
    onCreated?.();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-wrap items-end gap-3" noValidate>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">Code</label>
        <Input {...register("code")} placeholder="ex. 601" />
        {errors.code && <p className="mt-1 text-xs text-red-600">{errors.code.message}</p>}
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">Nom</label>
        <Input {...register("name")} placeholder="ex. Achats de marchandises" />
        {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
      </div>
      <Button type="submit" disabled={isSubmitting}>
        Ajouter le compte
      </Button>
    </form>
  );
}
