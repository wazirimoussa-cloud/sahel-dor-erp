// Suivi d'erreurs en production via le Loader Script Sentry (chargé depuis leur CDN,
// plutôt que le SDK npm @sentry/react) -- méthode choisie par l'utilisateur lors de la
// configuration. Le loader expose window.Sentry une fois chargé (asynchrone) ; les
// appels faits avant ce chargement sont mis en file ici (whenReady) plutôt que perdus,
// le loader ne fournissant pas cette garantie sans le snippet shim additionnel de Sentry.
const SENTRY_LOADER_URL = "https://js-de.sentry-cdn.com/c6e5f48e9967b71020ccaf96c4847c03.min.js";

interface SentryGlobal {
  captureException?: (error: unknown) => unknown;
  setUser?: (user: { id: string; email: string } | null) => void;
  setTag?: (key: string, value: string) => void;
}

declare global {
  interface Window {
    Sentry?: SentryGlobal;
  }
}

let ready = false;
let pending: (() => void)[] = [];

function whenReady(fn: () => void) {
  if (ready) fn();
  else pending.push(fn);
}

// Actif uniquement sur un build de production (Vercel) -- jamais en développement local
// (`vite dev`), pour ne pas polluer le quota Sentry avec des erreurs de code en cours
// d'écriture. Aucune fonctionnalité de l'app ne dépend de ce script : s'il échoue à se
// charger (bloqueur de pub, réseau), whenReady met simplement les appels en attente
// indéfiniment, sans jamais lever d'erreur.
export function initSentry() {
  if (!import.meta.env.PROD) return;

  const script = document.createElement("script");
  script.src = SENTRY_LOADER_URL;
  script.crossOrigin = "anonymous";
  script.onload = () => {
    ready = true;
    for (const fn of pending) fn();
    pending = [];
  };
  document.head.appendChild(script);

  // VITE_APP_LABEL distingue déjà Formation de Production dans la bannière
  // d'environnement (AppShell.tsx) -- même distinction ici, en tag personnalisé plutôt
  // que via l'option `environment` du SDK (non configurable après coup avec le loader,
  // qui s'auto-initialise depuis les réglages du projet Sentry, pas depuis ce code).
  setSentryTag("deployment", (import.meta.env.VITE_APP_LABEL as string | undefined) || "Réel");
}

export function captureException(error: unknown) {
  whenReady(() => window.Sentry?.captureException?.(error));
}

export function setSentryUser(user: { id: string; email: string } | null) {
  whenReady(() => window.Sentry?.setUser?.(user));
}

export function setSentryTag(key: string, value: string) {
  whenReady(() => window.Sentry?.setTag?.(key, value));
}
