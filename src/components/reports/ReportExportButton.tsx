import { useState } from "react";
import { Button } from "@/components/ui/Button";

interface ReportExportButtonProps {
  onExport: () => Promise<void>;
  disabled?: boolean;
  label?: string;
}

// Bouton "Exporter en Excel" partagé par les 11 états -- chaque appelant fournit onExport
// (construit filename/colonnes/rows puis appelle exportRowsToExcel, src/lib/xlsx.ts, jamais
// modifié). Gère uniquement l'état de chargement, pour éviter un double export sur double-clic.
export function ReportExportButton({ onExport, disabled, label = "Exporter en Excel" }: ReportExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);

  async function handleClick() {
    setIsExporting(true);
    try {
      await onExport();
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <Button type="button" variant="secondary" disabled={disabled || isExporting} onClick={() => void handleClick()}>
      {isExporting ? "Export en cours…" : label}
    </Button>
  );
}
