import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import clsx from "clsx";
import {
  LayoutDashboard,
  Package,
  Warehouse,
  Truck,
  ClipboardList,
  PackageCheck,
  PackageX,
  Factory,
  Layers,
  ArrowLeftRight,
  Users,
  ShoppingCart,
  BookOpen,
  NotebookText,
  LineChart,
  Receipt,
  History,
  UserCog,
  UserCircle,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/auth/useAuth";
import type { AttributionLevel } from "@/auth/AuthContext";
import { Button } from "@/components/ui/Button";
import { AlertsBell } from "@/components/layout/AlertsBell";
import { ROLE_LABELS } from "@/lib/roles";
import { useLogPageVisit } from "@/lib/useLogPageVisit";
import logo from "@/assets/logo.png";

const ENV_LABEL = (import.meta.env.VITE_APP_LABEL as string | undefined) || "Réel";

interface NavContext {
  hasModuleAccess: (module: string) => boolean;
  hasAttribution: (actionKey: string, minLevel?: AttributionLevel) => boolean;
}

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  module?: string;
  visible?: (ctx: NavContext) => boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Tableau de bord", icon: LayoutDashboard },
  { to: "/products", label: "Produits", icon: Package },
  { to: "/warehouses", label: "Magasins", icon: Warehouse, module: "entrepots" },
  { to: "/suppliers", label: "Fournisseurs", icon: Truck, module: "fournisseurs" },
  {
    to: "/purchases",
    label: "Achats",
    icon: ClipboardList,
    visible: ({ hasModuleAccess, hasAttribution }) =>
      hasModuleAccess("achats") && !hasAttribution("achats.receptionner"),
  },
  {
    to: "/purchases",
    label: "Réceptions",
    icon: PackageCheck,
    visible: ({ hasAttribution }) => hasAttribution("achats.receptionner"),
  },
  { to: "/transporteurs", label: "Transporteurs", icon: Truck, module: "transporteurs" },
  { to: "/pertes-transport", label: "Pertes transport", icon: PackageX, module: "transporteurs" },
  { to: "/pertes-stock", label: "Pertes de stock", icon: ShieldAlert, module: "pertes_stock" },
  { to: "/productions", label: "Production", icon: Factory, module: "production" },
  { to: "/transformations", label: "Transformation", icon: Layers, module: "transformation" },
  { to: "/stock", label: "Mouvements de stock", icon: ArrowLeftRight },
  { to: "/clients", label: "Clients", icon: Users, module: "clients" },
  { to: "/orders", label: "Commandes", icon: ShoppingCart, module: "ventes" },
  { to: "/chart-of-accounts", label: "Plan comptable", icon: BookOpen, module: "comptabilite" },
  { to: "/journal-comptable", label: "Journal comptable", icon: NotebookText, module: "journal_comptable" },
  { to: "/etats-financiers", label: "États financiers", icon: LineChart, module: "etats_financiers" },
  { to: "/declaration-tva", label: "Déclaration TVA", icon: Receipt, module: "etats_financiers" },
  { to: "/logs", label: "Journal d'audit", icon: History, module: "journal_audit" },
  { to: "/users", label: "Utilisateurs", icon: UserCog, module: "utilisateurs" },
  { to: "/account", label: "Mon compte", icon: UserCircle },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, signOut, hasModuleAccess, hasAttribution } = useAuth();
  useLogPageVisit();

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (!profile) return !item.module && !item.visible;
    if (item.visible) return item.visible({ hasModuleAccess, hasAttribution });
    return !item.module || hasModuleAccess(item.module);
  });

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-64 shrink-0 flex-col bg-forest-900 text-cream-100">
        <div className="flex items-center gap-3 border-b border-forest-700 px-5 py-5">
          <img src={logo} alt="Sahel d'Or" className="h-9 w-9 rounded object-cover" />
          <span className="font-serif text-lg font-bold tracking-wide text-brand-300">
            SAHEL D'OR
          </span>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
          {visibleItems.map((item, index) => (
            <NavLink
              key={`${item.to}-${index}`}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                clsx(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-forest-700 text-brand-300"
                    : "text-forest-100/80 hover:bg-forest-800 hover:text-cream-50",
                )
              }
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div
          className={clsx("h-3 border-t border-forest-700", ENV_LABEL === "Réel" ? "bg-forest-700" : "bg-brand-500")}
          title={ENV_LABEL === "Réel" ? "Environnement réel" : "Environnement Formation"}
        />
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-cream-200 bg-cream-50 px-6 py-3">
          <div className="text-sm text-gray-500">
            {profile ? (
              <>
                <span className="font-medium text-gray-800">{profile.email}</span>
                {profile.role && (
                  <span className="ml-2 rounded-full bg-forest-50 px-2 py-0.5 text-xs uppercase text-forest-700">
                    {ROLE_LABELS[profile.role]}
                  </span>
                )}
              </>
            ) : (
              "Profil en cours de chargement…"
            )}
          </div>
          <div className="flex items-center gap-3">
            <AlertsBell />
            <Button variant="secondary" onClick={() => void signOut()}>
              Déconnexion
            </Button>
          </div>
        </header>

        <main className="flex-1 bg-cream-50 p-6">{children}</main>
      </div>
    </div>
  );
}
