// Filtre de période + comparaison N-1, partagé entre les tableaux de bord (posé pour
// Finance, extrait ici dès qu'un 2e dashboard — Ventes — en a eu besoin, plutôt que de le
// dupliquer une 2e fois).

export function defaultStartDate() {
  return `${new Date().getFullYear()}-01-01`;
}

export function defaultEndDate() {
  return new Date().toISOString().slice(0, 10);
}

export function isoDateFromUtcMillis(utcMillis: number) {
  return new Date(utcMillis).toISOString().slice(0, 10);
}

// Période N-1 = période immédiatement précédente, de même durée en jours -- pas
// d'alignement calendaire ("même mois l'an dernier"), qui casserait sur les années
// bissextiles/mois de durée variable. Arithmétique entièrement en UTC (Date.UTC +
// toISOString, jamais le constructeur Date "local" + setDate) : un calcul en heure locale
// suivi d'une reconversion via toISOString() décale silencieusement la date d'un jour dès
// que le fuseau du navigateur n'est pas UTC -- bug réel trouvé et corrigé pendant la
// vérification du dashboard Finance.
export function priorPeriod(startDate: string, endDate: string) {
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const [ey, em, ed] = endDate.split("-").map(Number);
  const startMs = Date.UTC(sy, sm - 1, sd);
  const endMs = Date.UTC(ey, em - 1, ed);
  const days = Math.round((endMs - startMs) / 86_400_000) + 1;
  const priorEndMs = startMs - 86_400_000;
  const priorStartMs = priorEndMs - (days - 1) * 86_400_000;
  return {
    startDate: isoDateFromUtcMillis(priorStartMs),
    endDate: isoDateFromUtcMillis(priorEndMs),
  };
}
