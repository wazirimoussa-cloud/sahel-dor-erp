// Trouvé en audit pré-lancement : la plupart des formulaires remplaçaient l'erreur reçue
// par un message générique fixe listant 2-4 causes possibles, quelle que soit la vraie
// cause — le même problème déjà corrigé pour les commandes et les pertes de stock
// (voir describeOrderActionError/describeStockLossActionError), étendu ici à tous les
// autres formulaires. La plupart des RPC de l'app lèvent déjà des erreurs explicites et
// lisibles en français (RAISE EXCEPTION) ; il suffit de les afficher telles quelles au
// lieu de les jeter. Un message brut de contrainte Postgres (violation de CHECK, de
// NOT NULL, de policy RLS...) n'est en revanche jamais lisible tel quel — il suit
// toujours un gabarit anglais fixe, ce qui permet de le distinguer sans avoir besoin
// d'un code SQLSTATE précis (une RAISE EXCEPTION sans code explicite prend toujours
// P0001, indiscernable d'une autre erreur métier par le code seul).
const RAW_POSTGRES_ERROR =
  /^(new row for relation|duplicate key value|null value in column|insert or update on table|update or delete on table|permission denied)/i;

export function describeMutationError(err: unknown, fallback: string): string {
  const message = (err as { message?: string } | null)?.message;
  if (!message || RAW_POSTGRES_ERROR.test(message)) return fallback;
  return message;
}

export function isCheckConstraintViolation(err: unknown, constraintName: string): boolean {
  const code = (err as { code?: string } | null)?.code;
  const message = (err as { message?: string } | null)?.message ?? "";
  return code === "23514" && message.includes(constraintName);
}
