// toLocaleString("fr-FR") insere un espace insecable etroit comme separateur de milliers
// -- un caractere Unicode valide, mais quasi invisible dans beaucoup de rendus (ecran
// compresse, certaines polices), au point de sembler absent. Meme correctif deja
// applique cote PDF pour une raison differente (src/lib/pdf.ts, formatFcfa), jamais
// reporte cote interface jusqu-ici.
export function formatNumber(value: number): string {
  return value.toLocaleString("fr-FR").replace(/[\u202f\u00a0]/g, " ");
}

export function formatFCFA(value: number | null | undefined): string {
  return `${formatNumber(Math.round(value ?? 0))} FCFA`;
}
