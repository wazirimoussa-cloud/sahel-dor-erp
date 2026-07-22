import { Fragment, useState } from "react";
import { useUsers, useResetPassword } from "@/features/users/useUsers";
import { UserForm } from "@/features/users/UserForm";
import { UserAttributionsPanel } from "@/features/users/UserAttributionsPanel";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ROLE_LABELS } from "@/lib/roles";
import type { RoleName } from "@/lib/database.types";

export function UsersPage() {
  const { data: users, isLoading, error } = useUsers();
  const resetPassword = useResetPassword();
  const [actionError, setActionError] = useState<string | null>(null);
  const [managingUserId, setManagingUserId] = useState<string | null>(null);

  async function handleResetPassword(userId: string, email: string) {
    const confirmed = window.confirm(
      `Réinitialiser le mot de passe de ${email} à la valeur par défaut ? L'utilisateur devra le changer à sa prochaine connexion.`,
    );
    if (!confirmed) return;
    setActionError(null);
    try {
      await resetPassword.mutateAsync(userId);
    } catch {
      setActionError("Réinitialisation refusée (droits insuffisants).");
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-bold text-forest-900">Utilisateurs</h1>

      <Card>
        <UserForm />
      </Card>

      {actionError && <p className="text-sm text-red-600">{actionError}</p>}

      <Card>
        {isLoading && <p className="text-sm text-gray-500">Chargement…</p>}
        {error && <p className="text-sm text-red-600">Impossible de charger les utilisateurs.</p>}
        {users && (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="py-2">Email</th>
                <th className="py-2">Poste</th>
                <th className="py-2">Société</th>
                <th className="py-2">Créé le</th>
                <th className="py-2">Mot de passe</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const roleRelation = user.roles as { name: string } | { name: string }[] | null;
                const roleName = Array.isArray(roleRelation) ? roleRelation[0]?.name : roleRelation?.name;
                const companyRelation = user.companies as
                  | { name: string }
                  | { name: string }[]
                  | null;
                const companyName = Array.isArray(companyRelation)
                  ? companyRelation[0]?.name
                  : companyRelation?.name;
                return (
                  <Fragment key={user.id}>
                    <tr className="border-b border-gray-100">
                      <td className="py-2">{user.email}</td>
                      <td className="py-2">
                        {roleName ? (ROLE_LABELS[roleName as RoleName] ?? roleName) : "—"}
                      </td>
                      <td className="py-2">{companyName ?? "—"}</td>
                      <td className="py-2">{new Date(user.created_at).toLocaleDateString("fr-FR")}</td>
                      <td className="py-2">
                        {user.must_change_password ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                            À changer
                          </span>
                        ) : (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                            OK
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="secondary"
                            onClick={() =>
                              setManagingUserId(managingUserId === user.id ? null : user.id)
                            }
                          >
                            Gérer les attributions
                          </Button>
                          <Button
                            variant="secondary"
                            disabled={resetPassword.isPending}
                            onClick={() => void handleResetPassword(user.id, user.email)}
                          >
                            Réinitialiser le mot de passe
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {managingUserId === user.id && (
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <td colSpan={6} className="py-3">
                          <UserAttributionsPanel
                            userId={user.id}
                            userEmail={user.email}
                            onClose={() => setManagingUserId(null)}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-gray-400">
                    Aucun utilisateur pour le moment.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
