import { useAuth } from "@/auth/useAuth";
import { ChangePasswordForm } from "@/features/account/ChangePasswordForm";
import { Card } from "@/components/ui/Card";

export function AccountPage() {
  const { profile } = useAuth();

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-gray-800">Mon compte</h1>

      <Card className="max-w-sm">
        <p className="text-sm text-gray-500">Connecté en tant que</p>
        <p className="text-sm font-medium text-gray-800">{profile?.email}</p>
      </Card>

      <Card>
        <h2 className="mb-4 text-sm font-medium text-gray-700">Changer mon mot de passe</h2>
        <ChangePasswordForm />
      </Card>
    </div>
  );
}
