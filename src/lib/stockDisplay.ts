export const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  IN: "Entrée",
  OUT: "Sortie",
  ADJUSTMENT: "Ajustement",
};

// Libellé du sens d'un mouvement pour le journal filtrable de /stock : un ADJUSTMENT
// n'est pas un troisième type au sens du filtre (binaire Entrée/Sortie demandé par le
// client) mais garde la nuance "(ajustement)" dans l'affichage pour la fidélité de
// l'audit-trail.
export function movementDirectionLabel(direction: "IN" | "OUT", isAdjustment: boolean): string {
  const base = direction === "IN" ? "Entrée" : "Sortie";
  return isAdjustment ? `${base} (ajustement)` : base;
}

const EXPIRY_SOON_DAYS = 30;

export function lotStatus(expiryDate: string | null): { label: string; className: string } | null {
  if (!expiryDate) return null;
  const today = new Date().toISOString().slice(0, 10);
  if (expiryDate < today) {
    return { label: "Expiré", className: "bg-red-100 text-red-700" };
  }
  const soon = new Date();
  soon.setDate(soon.getDate() + EXPIRY_SOON_DAYS);
  if (expiryDate <= soon.toISOString().slice(0, 10)) {
    return { label: "Expire bientôt", className: "bg-amber-100 text-amber-700" };
  }
  return null;
}
