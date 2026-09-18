import { Fragment, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/auth/useAuth";
import { useTransporters, useUpdateTransporter } from "@/features/transporters/useTransporters";
import { TransporterForm } from "@/features/transporters/TransporterForm";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Pagination } from "@/components/ui/Pagination";
import { usePagination } from "@/lib/usePagination";
import { phoneSchema } from "@/lib/contactValidation";

const editTransporterSchema = z.object({
  name: z.string().min(1, "Nom requis"),
  phone: phoneSchema,
  email: z.string().email("Email invalide").optional().or(z.literal("")),
  address: z.string().optional(),
});
type EditTransporterFormValues = z.infer<typeof editTransporterSchema>;

export function TransportersPage() {
  const { hasAttribution } = useAuth();
  const { page, pageSize, goToPrevious, goToNext } = usePagination();
  const { data, isLoading, error } = useTransporters(page, pageSize);
  const transporters = data?.rows;
  const canManage = hasAttribution("transporteurs.gerer");
  const updateTransporter = useUpdateTransporter();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EditTransporterFormValues>({ resolver: zodResolver(editTransporterSchema) });

  function startEditing(transporter: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
  }) {
    setEditError(null);
    setEditingId(editingId === transporter.id ? null : transporter.id);
    reset({
      name: transporter.name,
      phone: transporter.phone ?? "",
      email: transporter.email ?? "",
      address: transporter.address ?? "",
    });
  }

  async function onSubmitEdit(transporterId: string, values: EditTransporterFormValues) {
    setEditError(null);
    try {
      await updateTransporter.mutateAsync({ id: transporterId, ...values });
      setEditingId(null);
    } catch {
      setEditError("Modification refusée (droits insuffisants ou email invalide).");
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-bold text-forest-900">Transporteurs</h1>

      {canManage && (
        <Card>
          <TransporterForm />
        </Card>
      )}

      <Card>
        {isLoading && <p className="text-sm text-gray-500">Chargement…</p>}
        {error && <p className="text-sm text-red-600">Impossible de charger les transporteurs.</p>}
        {transporters && (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th scope="col" className="py-2">Nom</th>
                <th scope="col" className="py-2">Téléphone</th>
                <th scope="col" className="py-2">Email</th>
                {canManage && <th scope="col" className="py-2" />}
              </tr>
            </thead>
            <tbody>
              {transporters.map((transporter) => (
                <Fragment key={transporter.id}>
                  <tr className="border-b border-gray-100">
                    <td className="py-2">{transporter.name}</td>
                    <td className="py-2">{transporter.phone ?? "—"}</td>
                    <td className="py-2">{transporter.email ?? "—"}</td>
                    {canManage && (
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          className="text-xs text-brand-600 hover:underline"
                          onClick={() => startEditing(transporter)}
                        >
                          Modifier
                        </button>
                      </td>
                    )}
                  </tr>
                  {editingId === transporter.id && (
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <td colSpan={4} className="py-2">
                        <form
                          onSubmit={handleSubmit((values) => onSubmitEdit(transporter.id, values))}
                          className="flex flex-wrap items-end gap-3"
                          noValidate
                        >
                          <div>
                            <label
                              htmlFor="edit-transporter-name"
                              className="mb-1 block text-xs font-medium text-gray-600"
                            >
                              Nom
                            </label>
                            <Input id="edit-transporter-name" {...register("name")} />
                            {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
                          </div>
                          <div>
                            <label
                              htmlFor="edit-transporter-phone"
                              className="mb-1 block text-xs font-medium text-gray-600"
                            >
                              Téléphone
                            </label>
                            <Input id="edit-transporter-phone" {...register("phone")} />
                            {errors.phone && (
                              <p className="mt-1 text-xs text-red-600">{errors.phone.message}</p>
                            )}
                          </div>
                          <div>
                            <label
                              htmlFor="edit-transporter-email"
                              className="mb-1 block text-xs font-medium text-gray-600"
                            >
                              Email
                            </label>
                            <Input id="edit-transporter-email" type="email" {...register("email")} />
                            {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
                          </div>
                          <div>
                            <label
                              htmlFor="edit-transporter-address"
                              className="mb-1 block text-xs font-medium text-gray-600"
                            >
                              Adresse
                            </label>
                            <Input id="edit-transporter-address" {...register("address")} />
                          </div>
                          <Button type="submit" disabled={isSubmitting}>
                            Enregistrer
                          </Button>
                          <Button type="button" variant="secondary" onClick={() => setEditingId(null)}>
                            Annuler
                          </Button>
                          {editError && (
                            <p role="alert" className="w-full text-xs text-red-600">
                              {editError}
                            </p>
                          )}
                        </form>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {transporters.length === 0 && (
                <tr>
                  <td colSpan={canManage ? 4 : 3} className="py-4 text-center text-gray-500">
                    Aucun transporteur pour le moment.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
        {transporters && (
          <Pagination
            page={page}
            hasNextPage={data?.hasNextPage ?? false}
            onPrevious={goToPrevious}
            onNext={goToNext}
          />
        )}
      </Card>
    </div>
  );
}
