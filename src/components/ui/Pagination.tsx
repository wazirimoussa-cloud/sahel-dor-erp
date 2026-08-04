import { Button } from "@/components/ui/Button";

export function Pagination({
  page,
  hasNextPage,
  onPrevious,
  onNext,
}: {
  page: number;
  hasNextPage: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
      <Button variant="secondary" onClick={onPrevious} disabled={page === 0}>
        Précédent
      </Button>
      <span className="text-sm text-gray-500">Page {page + 1}</span>
      <Button variant="secondary" onClick={onNext} disabled={!hasNextPage}>
        Suivant
      </Button>
    </div>
  );
}
