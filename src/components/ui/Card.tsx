import type { ReactNode } from "react";
import clsx from "clsx";

export type Accent = "green" | "gold" | "red" | "forest" | "amber";

// Exporté pour StatTile.tsx : les cartes KPI à seuil doivent réutiliser cette même palette
// de bordures plutôt que d'en dupliquer une — un seul système de couleurs "sens" dans l'app.
export const ACCENT_CLASSES: Record<Accent, string> = {
  green: "border-t-4 border-t-emerald-600",
  gold: "border-t-4 border-t-brand-500",
  red: "border-t-4 border-t-red-500",
  forest: "border-t-4 border-t-forest-700",
  amber: "border-t-4 border-t-amber-500",
};

export function Card({
  children,
  className,
  accent,
}: {
  children: ReactNode;
  className?: string;
  accent?: Accent;
}) {
  return (
    <div
      className={clsx(
        "rounded-lg border border-gray-200 bg-white p-6 shadow-sm",
        accent && ACCENT_CLASSES[accent],
        className,
      )}
    >
      {children}
    </div>
  );
}
