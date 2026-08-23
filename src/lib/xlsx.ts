// Génération de fichiers Excel côté client (exceljs), chargé en import() dynamique pour
// ne pas alourdir le bundle principal -- même motif que src/lib/pdf.ts. La page appelante
// normalise déjà ses données (libellés dérivés, jamais les identifiants bruts) avant
// d'appeler cette fonction ; ce module ne requête jamais Supabase lui-même.
//
// exceljs plutôt que le paquet npm "xlsx" (SheetJS) : ce dernier porte deux failles
// connues (pollution de prototype, ReDoS) jamais corrigées sur le registre npm -- le
// correctif n'existe que sur le CDN propre de SheetJS. exceljs n'a pas cet historique et
// s'installe normalement depuis npm.

export interface ExcelColumn {
  header: string;
  key: string;
}

export async function exportRowsToExcel(
  filename: string,
  columns: ExcelColumn[],
  rows: Record<string, string | number>[],
): Promise<void> {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Mouvements");
  worksheet.columns = columns.map((c) => ({ header: c.header, key: c.key }));
  worksheet.addRows(rows);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
