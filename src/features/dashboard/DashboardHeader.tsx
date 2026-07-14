export function DashboardHeader({ subtitle }: { subtitle: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
        Vue d'ensemble
      </p>
      <h1 className="mt-1 font-serif text-3xl font-bold text-forest-900">Tableau de bord</h1>
      <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
    </div>
  );
}
