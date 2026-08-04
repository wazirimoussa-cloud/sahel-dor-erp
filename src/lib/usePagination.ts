import { useState } from "react";

export const DEFAULT_PAGE_SIZE = 25;

export function usePagination(pageSize: number = DEFAULT_PAGE_SIZE) {
  const [page, setPage] = useState(0);

  return {
    page,
    pageSize,
    goToPrevious: () => setPage((p) => Math.max(0, p - 1)),
    goToNext: () => setPage((p) => p + 1),
    reset: () => setPage(0),
  };
}

// Demande pageSize + 1 lignes (via .range(from, to)) pour savoir s'il existe une page
// suivante sans requête de comptage séparée -- cohérent avec le choix de pagination
// Précédent/Suivant plutôt que numérotée avec total.
export function rangeFor(page: number, pageSize: number): [number, number] {
  const from = page * pageSize;
  return [from, from + pageSize];
}

export function splitPage<T>(rows: T[], pageSize: number): { rows: T[]; hasNextPage: boolean } {
  return { rows: rows.slice(0, pageSize), hasNextPage: rows.length > pageSize };
}
