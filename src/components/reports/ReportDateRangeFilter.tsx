import { Input } from "@/components/ui/Input";

interface ReportDateRangeFilterProps {
  idPrefix: string;
  startDate: string;
  endDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
}

// Filtre période partagé par les 11 états (src/features/reports/) -- même gabarit visuel que
// le filtre déjà utilisé sept fois dans les tableaux de bord (src/lib/dateRange.ts), mais
// volontairement sans comparaison N-1 : un état sert à extraire des données sur une période
// choisie, pas à comparer deux périodes.
export function ReportDateRangeFilter({
  idPrefix,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
}: ReportDateRangeFilterProps) {
  return (
    <>
      <div>
        <label htmlFor={`${idPrefix}-startDate`} className="mb-1 block text-xs font-medium text-gray-600">
          Période — du
        </label>
        <Input
          id={`${idPrefix}-startDate`}
          type="date"
          value={startDate}
          onChange={(e) => onStartDateChange(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-endDate`} className="mb-1 block text-xs font-medium text-gray-600">
          au
        </label>
        <Input
          id={`${idPrefix}-endDate`}
          type="date"
          value={endDate}
          onChange={(e) => onEndDateChange(e.target.value)}
        />
      </div>
    </>
  );
}
