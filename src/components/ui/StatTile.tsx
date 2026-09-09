import { Link } from "react-router-dom";
import { Card, ACCENT_CLASSES, type Accent } from "@/components/ui/Card";

export type StatTileStatus = "ok" | "warning" | "critical";

const STATUS_ACCENT: Record<StatTileStatus, Accent> = {
  ok: "forest",
  warning: "amber",
  critical: "red",
};

const DIRECTION_GLYPH: Record<"up" | "down" | "flat", string> = {
  up: "↑",
  down: "↓",
  flat: "→",
};

export interface StatTileDelta {
  value: string;
  direction: "up" | "down" | "flat";
  label?: string;
}

export interface StatTileProps {
  label: string;
  value: string;
  loading?: boolean;
  delta?: StatTileDelta;
  // Seule source de couleur "sens" de la carte -- contrairement au prop décoratif `accent`
  // de Card, absent ici volontairement : une carte sans seuil business réel (ex. chiffre
  // d'affaires) reste neutre plutôt que de porter une couleur arbitraire.
  status?: StatTileStatus;
  href?: string;
  secondaryLine?: { label: string; value: string };
}

export function StatTile({ label, value, loading, delta, status, href, secondaryLine }: StatTileProps) {
  const content = (
    <>
      <p className="text-xs uppercase text-gray-500">{label}</p>
      <p className="mt-1 font-mono text-2xl font-semibold text-gray-800">{loading ? "…" : value}</p>
      {!loading && delta && (
        <p className="mt-1 text-xs text-gray-500">
          {DIRECTION_GLYPH[delta.direction]} {delta.value}
          {delta.label ? ` ${delta.label}` : ""}
        </p>
      )}
      {!loading && secondaryLine && (
        <p className="mt-2 border-t border-gray-100 pt-2 text-xs text-gray-500">
          {secondaryLine.label} : <span className="font-medium text-gray-700">{secondaryLine.value}</span>
        </p>
      )}
    </>
  );

  const className = status ? ACCENT_CLASSES[STATUS_ACCENT[status]] : undefined;

  if (href) {
    return (
      <Link to={href} className="block transition-shadow hover:shadow-md">
        <Card className={className}>{content}</Card>
      </Link>
    );
  }

  return <Card className={className}>{content}</Card>;
}
