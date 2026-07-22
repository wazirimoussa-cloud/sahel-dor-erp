import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";

interface ProtectedRouteProps {
  children: ReactNode;
  requiredModule?: string;
}

// Ce garde ne fait que de l'UX (masquer/rediriger dans l'interface) : la sécurité réelle
// est appliquée par les policies RLS côté Supabase, jamais uniquement ici.
export function ProtectedRoute({ children, requiredModule }: ProtectedRouteProps) {
  const { session, profile, loading, hasModuleAccess } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-gray-500">Chargement…</div>;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (profile?.mustChangePassword && location.pathname !== "/force-password-change") {
    return <Navigate to="/force-password-change" replace />;
  }

  if (requiredModule && (!profile || !hasModuleAccess(requiredModule))) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-500">
        Accès refusé : aucune attribution pour ce module.
      </div>
    );
  }

  return <>{children}</>;
}
