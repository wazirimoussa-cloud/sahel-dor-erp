import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";
import { ChangePasswordForm } from "@/features/account/ChangePasswordForm";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

// Page minimale, sans AppShell/navigation, tant que le mot de passe par défaut n'a pas
// été changé (voir must_change_password, ProtectedRoute.tsx) — empêche de contourner en
// naviguant ailleurs dans l'app.
export function ForcePasswordChangePage() {
  const { session, profile, loading, signOut } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-gray-500">Chargement…</div>;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (profile && !profile.mustChangePassword) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-sm">
        <h1 className="mb-1 text-xl font-semibold text-brand-700">Sahel d'Or</h1>
        <p className="mb-6 text-sm text-gray-500">
          Ce compte utilise encore le mot de passe par défaut — vous devez le changer
          avant de continuer.
        </p>
        <ChangePasswordForm onSuccess={() => navigate("/", { replace: true })} />
        <Button variant="secondary" className="mt-4 w-full" onClick={() => void signOut()}>
          Déconnexion
        </Button>
      </Card>
    </div>
  );
}
