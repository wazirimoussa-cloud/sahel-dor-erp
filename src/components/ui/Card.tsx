import type { ReactNode } from "react";
import clsx from "clsx";

type Accent = "green" | "gold" | "red" | "forest";

const ACCENT_CLASSES: Record<Accent, string> = {
  green: "border-t-4 border-t-emerald-600",
  gold: "border-t-4 border-t-brand-500",
  red: "border-t-4 border-t-red-500",
  forest: "border-t-4 border-t-forest-700",
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
