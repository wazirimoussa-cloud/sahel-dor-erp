// Génération de PDF côté client (jsPDF + jspdf-autotable), chargés en import() dynamique
// pour ne pas alourdir le bundle principal — voir README, section "Écarts et
// améliorations". Chaque générateur reçoit des données déjà normalisées par la page
// appelante (jamais la forme brute Supabase objet-ou-tableau).

interface PdfLineItem {
  productName: string;
  quantity: number;
  unitAmount: number;
  unit?: string;
}

interface DocumentTotals {
  totalHT: number;
  vatRate: number;
  vatAmount: number;
  totalTTC: number;
}

function formatFcfa(amount: number): string {
  return `${amount.toLocaleString("fr-FR")} FCFA`;
}

async function newDocument(title: string) {
  const [{ default: JsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc = new JsPDF();

  doc.setFontSize(16);
  doc.text("Sahel d'Or", 14, 18);
  doc.setFontSize(11);
  doc.text(title, 14, 26);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(new Date().toLocaleString("fr-FR"), 14, 32);
  doc.setTextColor(0);

  return { doc, autoTable };
}

function addTotalsBlock(
  doc: InstanceType<typeof import("jspdf").default>,
  startY: number,
  totals: DocumentTotals,
): void {
  doc.setFontSize(10);
  doc.text(`Sous-total HT : ${formatFcfa(totals.totalHT)}`, 140, startY, { align: "left" });
  doc.text(`TVA (${totals.vatRate}%) : ${formatFcfa(totals.vatAmount)}`, 140, startY + 6, {
    align: "left",
  });
  doc.setFontSize(11);
  doc.text(`Total TTC : ${formatFcfa(totals.totalTTC)}`, 140, startY + 14, { align: "left" });
}

export interface OrderPdfInput {
  id: string;
  createdAt: string;
  clientName: string;
  warehouseName?: string;
  items: PdfLineItem[];
  totals: DocumentTotals;
  paymentStatusLabel: string;
}

export async function generateOrderPdf(input: OrderPdfInput) {
  const { doc, autoTable } = await newDocument(`Facture de vente #${input.id.slice(0, 8)}`);

  doc.setFontSize(10);
  doc.text(`Date : ${new Date(input.createdAt).toLocaleString("fr-FR")}`, 14, 42);
  doc.text(`Client : ${input.clientName}`, 14, 48);
  doc.text(`Statut paiement : ${input.paymentStatusLabel}`, 14, 54);

  autoTable(doc, {
    startY: 60,
    head: [["Produit", "Quantité", "Prix unitaire", "Sous-total"]],
    body: input.items.map((item) => [
      item.productName,
      `${item.quantity}${item.unit ? " " + item.unit : ""}`,
      formatFcfa(item.unitAmount),
      formatFcfa(item.unitAmount * item.quantity),
    ]),
  });

  const finalY =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 60;
  addTotalsBlock(doc, finalY + 10, input.totals);

  return { doc, filename: `facture-${input.id.slice(0, 8)}.pdf` };
}

export interface PurchasePdfInput {
  id: string;
  createdAt: string;
  supplierName: string;
  warehouseName: string;
  items: PdfLineItem[];
  totals: DocumentTotals;
}

export async function generatePurchasePdf(input: PurchasePdfInput) {
  const { doc, autoTable } = await newDocument(`Bon d'achat #${input.id.slice(0, 8)}`);

  doc.setFontSize(10);
  doc.text(`Date : ${new Date(input.createdAt).toLocaleString("fr-FR")}`, 14, 42);
  doc.text(`Fournisseur : ${input.supplierName}`, 14, 48);
  doc.text(`Magasin : ${input.warehouseName}`, 14, 54);

  autoTable(doc, {
    startY: 60,
    head: [["Produit", "Quantité", "Coût unitaire", "Sous-total"]],
    body: input.items.map((item) => [
      item.productName,
      `${item.quantity}${item.unit ? " " + item.unit : ""}`,
      formatFcfa(item.unitAmount),
      formatFcfa(item.unitAmount * item.quantity),
    ]),
  });

  const finalY =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 60;
  addTotalsBlock(doc, finalY + 10, input.totals);

  return { doc, filename: `bon-achat-${input.id.slice(0, 8)}.pdf` };
}

export interface JournalPdfEntry {
  id: string;
  entryDate: string;
  journalCode: string;
  description: string;
  lines: { accountLabel: string; debit: number; credit: number }[];
}

export async function generateJournalPdf(entries: JournalPdfEntry[]) {
  const { doc, autoTable } = await newDocument("Journal comptable");

  let y = 42;
  for (const entry of entries) {
    if (y > 260) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(10);
    doc.text(
      `${entry.journalCode} — ${entry.description} (${new Date(entry.entryDate).toLocaleString("fr-FR")})`,
      14,
      y,
    );

    autoTable(doc, {
      startY: y + 4,
      head: [["Compte", "Débit", "Crédit"]],
      body: entry.lines.map((line) => [
        line.accountLabel,
        line.debit > 0 ? formatFcfa(line.debit) : "",
        line.credit > 0 ? formatFcfa(line.credit) : "",
      ]),
      styles: { fontSize: 9 },
    });

    y =
      ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 4) +
      10;
  }

  return { doc, filename: `journal-comptable-${new Date().toISOString().slice(0, 10)}.pdf` };
}

export interface VatDeclarationPdfInput {
  periodLabel: string;
  vatRate: number;
  chiffreAffairesHT: number;
  tvaCollectee: number;
  achatsHT: number;
  tvaDeductible: number;
  tvaNette: number;
}

export async function generateVatDeclarationPdf(input: VatDeclarationPdfInput) {
  const { doc, autoTable } = await newDocument(`Déclaration TVA — ${input.periodLabel}`);

  doc.setFontSize(10);
  doc.text(`Taux de TVA applicable : ${input.vatRate}%`, 14, 42);

  autoTable(doc, {
    startY: 50,
    head: [["", "Montant"]],
    body: [
      ["Chiffre d'affaires HT (ventes)", formatFcfa(input.chiffreAffairesHT)],
      ["TVA collectée", formatFcfa(input.tvaCollectee)],
      ["Achats HT", formatFcfa(input.achatsHT)],
      ["TVA déductible", formatFcfa(input.tvaDeductible)],
      [
        input.tvaNette >= 0 ? "TVA nette à payer" : "Crédit de TVA à reporter",
        formatFcfa(Math.abs(input.tvaNette)),
      ],
    ],
  });

  return {
    doc,
    filename: `declaration-tva-${input.periodLabel.replace(/\s+/g, "-").toLowerCase()}.pdf`,
  };
}

export interface CreditNotePdfInput {
  purchaseId: string;
  transporterName: string;
  createdAt: string;
  items: { productName: string; quantityLost: number; unitCost: number; unit?: string }[];
}

export async function generateCreditNotePdf(input: CreditNotePdfInput) {
  const { doc, autoTable } = await newDocument(
    `Facture d'avoir — Transporteur (achat #${input.purchaseId.slice(0, 8)})`,
  );

  doc.setFontSize(10);
  doc.text(`Date de constat : ${new Date(input.createdAt).toLocaleString("fr-FR")}`, 14, 42);
  doc.text(`Transporteur : ${input.transporterName}`, 14, 48);
  doc.text("Motif : pertes/dommages constatés à la réception, avant entrée en stock", 14, 54);

  const total = input.items.reduce((sum, item) => sum + item.quantityLost * item.unitCost, 0);

  autoTable(doc, {
    startY: 62,
    head: [["Produit", "Quantité perdue", "Coût unitaire", "Valeur réclamée"]],
    body: input.items.map((item) => [
      item.productName,
      `${item.quantityLost}${item.unit ? " " + item.unit : ""}`,
      formatFcfa(item.unitCost),
      formatFcfa(item.quantityLost * item.unitCost),
    ]),
  });

  const finalY =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 62;
  doc.setFontSize(11);
  doc.text(`Total réclamé : ${formatFcfa(total)}`, 140, finalY + 10, { align: "left" });

  return {
    doc,
    filename: `facture-avoir-${input.purchaseId.slice(0, 8)}.pdf`,
  };
}
