// Partage de fichier natif (WhatsApp/email/etc., au choix de l'utilisateur dans la
// feuille système) via Web Share API niveau 2 (fichiers) — fiable sur mobile (Android
// Chrome, iOS Safari 15+), support desktop inégal. Repli automatique sur un simple
// téléchargement quand l'API ou le partage de fichiers n'est pas disponible.

type JsPdfDoc = InstanceType<typeof import("jspdf").default>;

function docToFile(doc: JsPdfDoc, filename: string): File {
  const blob = doc.output("blob") as Blob;
  return new File([blob], filename, { type: "application/pdf" });
}

export function canSharePdf(): boolean {
  if (typeof navigator === "undefined" || !navigator.share || !navigator.canShare) return false;
  try {
    const probe = new File(["probe"], "probe.pdf", { type: "application/pdf" });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

export async function shareOrDownloadPdf(doc: JsPdfDoc, filename: string, title: string): Promise<void> {
  if (canSharePdf()) {
    const file = docToFile(doc, filename);
    try {
      await navigator.share({ files: [file], title });
      return;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      // Repli sur le téléchargement si le partage échoue pour une autre raison.
    }
  }
  doc.save(filename);
}
