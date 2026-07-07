import { useUsers } from "@/features/users/useUsers";
import { UserForm } from "@/features/users/UserForm";
import { Card } from "@/components/ui/Card";

export function UsersPage() {
  const { data: users, isLoading, error } = useUsers();

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-gray-800">Utilisateurs</h1>

      <Card>
        <UserForm />
      </Card>

      <Card>
        {isLoading && <p className="text-sm text-gray-500">Chargement…</p>}
        {error && <p className="text-sm text-red-600">Impossible de charger les utilisateurs.</p>}
        {users && (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="py-2">Email</th>
                <th className="py-2">Rôle</th>
                <th className="py-2">Société</th>
                <th className="py-2">Créé le</th>
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
                  <tr key={user.id} className="border-b border-gray-100">
                    <td className="py-2">{user.email}</td>
                    <td className="py-2 uppercase">{roleName ?? "—"}</td>
                    <td className="py-2">{companyName ?? "—"}</td>
                    <td className="py-2">{new Date(user.created_at).toLocaleDateString("fr-FR")}</td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-gray-400">
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
