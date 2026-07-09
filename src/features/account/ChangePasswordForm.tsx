import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/useAuth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Mot de passe actuel requis"),
    newPassword: z.string().min(8, "8 caractères minimum"),
    confirmPassword: z.string().min(1, "Confirmation requise"),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: "Les mots de passe ne correspondent pas",
    path: ["confirmPassword"],
  });

type ChangePasswordValues = z.infer<typeof changePasswordSchema>;

export function ChangePasswordForm({ onSuccess }: { onSuccess?: () => void } = {}) {
  const { profile } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordValues>({ resolver: zodResolver(changePasswordSchema) });

  async function onSubmit(values: ChangePasswordValues) {
    if (!profile) return;
    setServerError(null);
    setSuccess(false);

    // Re-vérifie le mot de passe actuel avant tout changement : une session ouverte ne
    // suffit pas (poste partagé, session laissée ouverte) — on exige de reprouver
    // l'identité, supabase-js n'offrant pas de vérification dédiée pour email/password.
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email: profile.email,
      password: values.currentPassword,
    });
    if (reauthError) {
      setServerError("Mot de passe actuel incorrect.");
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: values.newPassword,
    });
    if (updateError) {
      setServerError(updateError.message);
      return;
    }

    setSuccess(true);
    reset();
    onSuccess?.();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-sm space-y-4" noValidate>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Mot de passe actuel</label>
        <Input type="password" autoComplete="current-password" {...register("currentPassword")} />
        {errors.currentPassword && (
          <p className="mt-1 text-xs text-red-600">{errors.currentPassword.message}</p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Nouveau mot de passe</label>
        <Input type="password" autoComplete="new-password" {...register("newPassword")} />
        {errors.newPassword && <p className="mt-1 text-xs text-red-600">{errors.newPassword.message}</p>}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Confirmer le nouveau mot de passe
        </label>
        <Input type="password" autoComplete="new-password" {...register("confirmPassword")} />
        {errors.confirmPassword && (
          <p className="mt-1 text-xs text-red-600">{errors.confirmPassword.message}</p>
        )}
      </div>

      {serverError && <p className="text-sm text-red-600">{serverError}</p>}
      {success && <p className="text-sm text-green-600">Mot de passe mis à jour avec succès.</p>}

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Mise à jour…" : "Changer le mot de passe"}
      </Button>
    </form>
  );
}
