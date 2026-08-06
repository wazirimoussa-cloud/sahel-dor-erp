import { Component, type ReactNode } from "react";
import { captureException } from "@/lib/sentry";

interface Props {
  children: ReactNode;
}

interface State {
  crashed: boolean;
}

// Filet de sécurité pour un plantage React imprévu (état incohérent, erreur de rendu) :
// signale l'erreur à Sentry (no-op si non configuré, voir lib/sentry.ts) et affiche un
// écran de repli au lieu d'une page blanche silencieuse.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { crashed: false };

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  componentDidCatch(error: unknown) {
    captureException(error);
  }

  render() {
    if (this.state.crashed) {
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-4 bg-cream-50 p-6 text-center">
          <p className="text-sm font-semibold text-forest-900">Une erreur inattendue est survenue.</p>
          <p className="max-w-sm text-sm text-gray-500">
            L'incident a été signalé automatiquement. Rechargez la page pour continuer.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Recharger la page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
