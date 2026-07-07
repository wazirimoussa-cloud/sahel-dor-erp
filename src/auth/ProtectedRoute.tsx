import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";
import type { RoleName } from "@/lib/database.types";

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: RoleName[];
}

// Ce garde ne fait que de l'UX (masquer/rediriger dans l'interface) : la sécurité réelle
// est appliquée par les policies RLS côté Supabase, jamais uniquement ici.
export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-gray-500">Chargement…</div>;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && (!profile || !allowedRoles.includes(profile.role))) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-500">
        Accès refusé pour votre rôle.
      </div>
    );
  }

  return <>{children}</>;
}
