export const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  IN: "Entrée",
  OUT: "Sortie",
  ADJUSTMENT: "Ajustement",
};

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
