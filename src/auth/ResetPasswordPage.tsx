import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { EnvBanner } from "@/components/layout/EnvBanner";
import logo from "@/assets/logo.png";

// Page atteinte via le lien reçu par email ("mot de passe oublié", admin uniquement —
// voir supabase/functions/request-password-reset). L'identité est déjà prouvée par le
// jeton de récupération à usage unique contenu dans l'URL (détecté automatiquement par
// supabase-js, detectSessionInUrl) : pas de champ "mot de passe actuel" ici, contrairement
// à ChangePasswordForm.
const resetSchema = z
  .object({
    newPassword: z.string().min(8, "8 caractères minimum"),
    confirmPassword: z.string().min(1, "Confirmation requise"),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: "Les mots de passe ne correspondent pas",
    path: ["confirmPassword"],
  });

type ResetPasswordValues = z.infer<typeof resetSchema>;

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordValues>({ resolver: zodResolver(resetSchema) });

  async function onSubmit(values: ResetPasswordValues) {
    setServerError(null);
    const { error } = await supabase.auth.updateUser({ password: values.newPassword });
    if (error) {
      setServerError(
        "Lien invalide ou expiré — redemandez une réinitialisation depuis l'écran de connexion.",
      );
      return;
    }
    navigate("/", { replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col">
      <EnvBanner />
      <div className="flex flex-1 items-center justify-center bg-gray-50 px-4">
        <Card className="w-full max-w-sm">
          <img src={logo} alt="Sahel d'Or" className="mx-auto mb-4 h-24 w-24 rounded-lg object-cover" />
          <h1 className="mb-1 text-center text-xl font-semibold text-brand-700">Sahel d'Or</h1>
          <p className="mb-6 text-center text-sm text-gray-500">Définir un nouveau mot de passe</p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Nouveau mot de passe
              </label>
              <Input type="password" autoComplete="new-password" {...register("newPassword")} />
              {errors.newPassword && (
                <p className="mt-1 text-xs text-red-600">{errors.newPassword.message}</p>
              )}
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

            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? "Enregistrement…" : "Définir le mot de passe"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
