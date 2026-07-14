import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/useAuth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { EnvBanner } from "@/components/layout/EnvBanner";
import logo from "@/assets/logo.png";

const loginSchema = z.object({
  email: z.string().email("Adresse email invalide"),
  password: z.string().min(1, "Mot de passe requis"),
});

const forgotPasswordSchema = z.object({
  email: z.string().email("Adresse email invalide"),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

const FORGOT_PASSWORD_MESSAGE =
  "Si un compte administrateur existe avec cet email, un lien de réinitialisation vient d'être envoyé.";

export function LoginPage() {
  const { session, loading } = useAuth();
  const location = useLocation();
  const [serverError, setServerError] = useState<string | null>(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordMessage, setForgotPasswordMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  const {
    register: registerForgotPassword,
    handleSubmit: handleForgotPasswordSubmit,
    formState: { errors: forgotPasswordErrors, isSubmitting: isSubmittingForgotPassword },
  } = useForm<ForgotPasswordValues>({ resolver: zodResolver(forgotPasswordSchema) });

  if (!loading && session) {
    const from = (location.state as { from?: string } | null)?.from ?? "/";
    return <Navigate to={from} replace />;
  }

  async function onSubmit(values: LoginFormValues) {
    setServerError(null);
    const { error } = await supabase.auth.signInWithPassword(values);
    if (error) {
      setServerError("Identifiants incorrects ou compte inexistant.");
    }
  }

  async function onForgotPasswordSubmit(values: ForgotPasswordValues) {
    setForgotPasswordMessage(null);
    await supabase.functions.invoke("request-password-reset", {
      body: { email: values.email, redirectTo: `${window.location.origin}/reset-password` },
    });
    // Toujours le même message, que le compte existe/soit admin ou non — voir
    // supabase/functions/request-password-reset.
    setForgotPasswordMessage(FORGOT_PASSWORD_MESSAGE);
  }

  return (
    <div className="flex min-h-screen flex-col">
      <EnvBanner />
      <div className="flex flex-1 items-center justify-center bg-gray-50 px-4">
        <Card className="w-full max-w-sm">
          <img src={logo} alt="Sahel d'Or" className="mx-auto mb-4 h-24 w-24 rounded-lg object-cover" />
          <h1 className="mb-1 text-center text-xl font-semibold text-brand-700">Sahel d'Or</h1>
          <p className="mb-6 text-center text-sm text-gray-500">Connexion à l'espace de gestion</p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-700">
                Email
              </label>
              <Input id="email" type="email" autoComplete="email" {...register("email")} />
              {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
            </div>

            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-medium text-gray-700">
                Mot de passe
              </label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                {...register("password")}
              />
              {errors.password && (
                <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
              )}
            </div>

            {serverError && <p className="text-sm text-red-600">{serverError}</p>}

            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? "Connexion…" : "Se connecter"}
            </Button>
          </form>

          <button
            type="button"
            className="mt-3 text-xs text-brand-600 hover:underline"
            onClick={() => {
              setShowForgotPassword((value) => !value);
              setForgotPasswordMessage(null);
            }}
          >
            Mot de passe oublié ?
          </button>

          {showForgotPassword && (
            <form
              onSubmit={handleForgotPasswordSubmit(onForgotPasswordSubmit)}
              className="mt-3 space-y-3 border-t border-gray-100 pt-3"
              noValidate
            >
              <p className="text-xs text-gray-500">
                Reçoit un lien de réinitialisation uniquement si ce compte est
                administrateur.
              </p>
              <div>
                <label htmlFor="forgot-email" className="mb-1 block text-xs font-medium text-gray-600">
                  Email
                </label>
                <Input id="forgot-email" type="email" {...registerForgotPassword("email")} />
                {forgotPasswordErrors.email && (
                  <p className="mt-1 text-xs text-red-600">{forgotPasswordErrors.email.message}</p>
                )}
              </div>
              {forgotPasswordMessage && (
                <p className="text-xs text-green-600">{forgotPasswordMessage}</p>
              )}
              <Button
                type="submit"
                variant="secondary"
                disabled={isSubmittingForgotPassword}
                className="w-full"
              >
                {isSubmittingForgotPassword ? "Envoi…" : "Envoyer le lien"}
              </Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
