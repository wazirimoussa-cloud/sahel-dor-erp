import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/useAuth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import logo from "@/assets/logo.webp";

const challengeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Code à 6 chiffres"),
});

type ChallengeFormValues = z.infer<typeof challengeSchema>;

// Page minimale, sans AppShell/navigation, tant que le 2e facteur n'a pas été saisi cette
// session -- même patron que ForcePasswordChangePage (empêche de contourner en naviguant
// ailleurs dans l'app ; la vraie barrière reste needsMfaChallenge dans ProtectedRoute,
// cette page n'est qu'un moyen de le résoudre).
export function MfaChallengePage() {
  const { session, loading, needsMfaChallenge, refreshMfaStatus, signOut } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [loadingFactor, setLoadingFactor] = useState(true);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ChallengeFormValues>({ resolver: zodResolver(challengeSchema) });

  useEffect(() => {
    let mounted = true;
    supabase.auth.mfa.listFactors().then(({ data }) => {
      if (!mounted) return;
      // data.totp ne contient que les facteurs déjà vérifiés (garanti par le SDK).
      setFactorId(data?.totp[0]?.id ?? null);
      setLoadingFactor(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-gray-500">Chargement…</div>;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (!needsMfaChallenge) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(values: ChallengeFormValues) {
    if (!factorId) return;
    setServerError(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: values.code });
    if (error) {
      setServerError("Code invalide ou expiré.");
      return;
    }
    await refreshMfaStatus();
    navigate("/", { replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-sm">
        <img src={logo} alt="Sahel d'Or" className="mx-auto mb-4 h-24 w-24 rounded-lg object-cover" />
        <h1 className="mb-1 text-center text-xl font-semibold text-brand-700">Sahel d'Or</h1>
        <p className="mb-6 text-center text-sm text-gray-500">
          Ce compte utilise la double authentification — entrez le code généré par votre
          application d'authentification.
        </p>

        {loadingFactor ? (
          <p className="text-center text-sm text-gray-500">Chargement…</p>
        ) : !factorId ? (
          <p role="alert" className="text-sm text-red-600">
            Aucun facteur de double authentification vérifié n'a été trouvé sur ce compte.
            Contactez un administrateur.
          </p>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div>
              <label htmlFor="mfa-code" className="mb-1 block text-sm font-medium text-gray-700">
                Code à 6 chiffres
              </label>
              <Input
                id="mfa-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                {...register("code")}
              />
              {errors.code && <p className="mt-1 text-xs text-red-600">{errors.code.message}</p>}
            </div>

            {serverError && (
              <p role="alert" className="text-sm text-red-600">
                {serverError}
              </p>
            )}

            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? "Vérification…" : "Vérifier"}
            </Button>
          </form>
        )}

        <Button variant="secondary" className="mt-4 w-full" onClick={() => void signOut()}>
          Déconnexion
        </Button>
      </Card>
    </div>
  );
}
