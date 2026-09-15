// Calcul de la TVA à 3 paliers (exonéré/réduit/normal) -- même logique que validate_order/
// receive_purchase côté serveur (migration 0095), dupliquée ici uniquement pour l'aperçu
// client avant/après soumission (le montant réellement posté au grand livre vient toujours
// du serveur). Extrait après la 4ᵉ occurrence du même calcul (OrdersPage, OrderDetailPage,
// PurchasesPage, PurchaseDetailPage) -- règle des trois occurrences déjà appliquée ailleurs
// dans l'app (orderDisplay.ts, purchaseDisplay.ts).

export interface VatLineItem {
  quantity: number;
  unitPrice: number;
  vatExempt: boolean;
  vatReduced: boolean;
}

export interface VatBreakdown {
  totalHT: number;
  vatAmount: number;
  totalTTC: number;
}

export function computeVatBreakdown(
  items: VatLineItem[],
  vatRate: number,
  vatReducedRate: number,
): VatBreakdown {
  let totalHT = 0;
  let taxableStandard = 0;
  let taxableReduced = 0;

  for (const item of items) {
    const lineValue = item.quantity * item.unitPrice;
    totalHT += lineValue;
    if (item.vatExempt) continue;
    if (item.vatReduced) {
      taxableReduced += lineValue;
    } else {
      taxableStandard += lineValue;
    }
  }

  const vatAmount =
    Math.round(taxableStandard * vatRate) / 100 + Math.round(taxableReduced * vatReducedRate) / 100;

  return { totalHT, vatAmount, totalTTC: totalHT + vatAmount };
}
