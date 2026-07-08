// Bannière optionnelle (ex. "ENVIRONNEMENT FORMATION") pour distinguer visuellement un
// déploiement de formation/démo de la production — voir VITE_APP_LABEL dans .env.example.
// Affichée à la fois sur l'écran de connexion et dans AppShell : c'est avant de se
// connecter, avec des identifiants de démo, que la confusion d'environnement coûte le
// plus cher.
const ENV_LABEL = import.meta.env.VITE_APP_LABEL as string | undefined;

export function EnvBanner() {
  if (!ENV_LABEL) return null;

  return (
    <div className="bg-amber-500 px-4 py-1 text-center text-xs font-semibold uppercase tracking-wide text-white">
      {ENV_LABEL}
    </div>
  );
}
