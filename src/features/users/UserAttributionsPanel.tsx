import { useEffect, useState } from "react";
import {
  useAttributionsCatalog,
  useSetUserAttributions,
  useUserAttributions,
} from "@/features/users/useUsers";
import type { AttributionLevel } from "@/auth/AuthContext";
import { Button } from "@/components/ui/Button";

const MODULE_LABELS: Record<string, string> = {
  produits: "Produits",
  entrepots: "Entrepôts",
  fournisseurs: "Fournisseurs",
  clients: "Clients",
  achats: "Achats",
  ventes: "Ventes",
  stock: "Stock",
  pertes_stock: "Pertes de stock",
  transporteurs: "Transporteurs",
  production: "Production",
  transformation: "Transformation",
  comptabilite: "Comptabilité",
  journal_audit: "Journal d'audit",
  journal_comptable: "Journal comptable",
  etats_financiers: "États financiers",
  utilisateurs: "Utilisateurs",
};

type LevelChoice = "aucun" | AttributionLevel;

export function UserAttributionsPanel({
  userId,
  userEmail,
  onClose,
}: {
  userId: string;
  userEmail: string;
  onClose: () => void;
}) {
  const { data: catalog, isLoading: isLoadingCatalog } = useAttributionsCatalog();
  const { data: current, isLoading: isLoadingCurrent } = useUserAttributions(userId);
  const setAttributions = useSetUserAttributions();
  const [choices, setChoices] = useState<Record<string, LevelChoice>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!current) return;
    const initial: Record<string, LevelChoice> = {};
    for (const assignment of current) {
      initial[assignment.actionKey] = assignment.level;
    }
    setChoices(initial);
  }, [current]);

  if (isLoadingCatalog || isLoadingCurrent || !catalog) {
    return <p className="text-sm text-gray-500">Chargement des attributions…</p>;
  }

  const modules = [...new Set(catalog.map((a) => a.module))];

  function setLevel(actionKey: string, level: LevelChoice) {
    setSaved(false);
    setChoices((prev) => ({ ...prev, [actionKey]: level }));
  }

  function setModuleLevel(module: string, level: LevelChoice) {
    setSaved(false);
    setChoices((prev) => {
      const next = { ...prev };
      for (const attribution of catalog!.filter((a) => a.module === module)) {
        next[attribution.actionKey] = level;
      }
      return next;
    });
  }

  async function handleSave() {
    setSaveError(null);
    setSaved(false);
    const assignments = Object.entries(choices)
      .filter((entry): entry is [string, AttributionLevel] => entry[1] !== "aucun")
      .map(([actionKey, level]) => ({ actionKey, level }));
    try {
      await setAttributions.mutateAsync({ userId, assignments });
      setSaved(true);
    } catch (err) {
      const message =
        (err as { message?: string } | null)?.message ?? "Enregistrement refusé.";
      setSaveError(message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-forest-900">Attributions de {userEmail}</h3>
        <button type="button" className="text-xs text-gray-500 hover:underline" onClick={onClose}>
          Fermer
        </button>
      </div>

      <div className="space-y-4">
        {modules.map((module) => (
          <div key={module} className="rounded-md border border-gray-200 p-3">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                {MODULE_LABELS[module] ?? module}
              </h4>
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  className="text-gray-400 hover:underline"
                  onClick={() => setModuleLevel(module, "aucun")}
                >
                  Aucun
                </button>
                <button
                  type="button"
                  className="text-gray-500 hover:underline"
                  onClick={() => setModuleLevel(module, "consultative")}
                >
                  Tout en consultatif
                </button>
                <button
                  type="button"
                  className="text-brand-600 hover:underline"
                  onClick={() => setModuleLevel(module, "operationnelle")}
                >
                  Tout en opérationnel
                </button>
              </div>
            </div>
            <div className="space-y-1">
              {catalog
                .filter((a) => a.module === module)
                .map((attribution) => (
                  <div
                    key={attribution.actionKey}
                    className="flex items-center justify-between gap-3 py-1 text-sm"
                  >
                    <span className="text-gray-700">{attribution.label}</span>
                    <select
                      className="rounded-md border border-gray-300 px-2 py-1 text-xs"
                      value={choices[attribution.actionKey] ?? "aucun"}
                      onChange={(e) => setLevel(attribution.actionKey, e.target.value as LevelChoice)}
                    >
                      <option value="aucun">Aucun</option>
                      <option value="consultative">Consultative</option>
                      <option value="operationnelle">Opérationnelle</option>
                    </select>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>

      {saveError && <p className="text-xs text-red-600">{saveError}</p>}
      {saved && <p className="text-xs text-green-700">Attributions enregistrées.</p>}

      <div className="flex justify-end">
        <Button type="button" disabled={setAttributions.isPending} onClick={() => void handleSave()}>
          Enregistrer les attributions
        </Button>
      </div>
    </div>
  );
}
