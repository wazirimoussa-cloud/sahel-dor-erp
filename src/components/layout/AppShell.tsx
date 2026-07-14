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
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/auth/useAuth";
import { Button } from "@/components/ui/Button";
import { AlertsBell } from "@/components/layout/AlertsBell";
import type { RoleName } from "@/lib/database.types";
import { ROLE_LABELS } from "@/lib/roles";
import { useLogPageVisit } from "@/lib/useLogPageVisit";
import logo from "@/assets/logo.png";

const ENV_LABEL = (import.meta.env.VITE_APP_LABEL as string | undefined) || "Réel";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles?: RoleName[];
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Tableau de bord", icon: LayoutDashboard },
  { to: "/products", label: "Produits", icon: Package },
  {
    to: "/warehouses",
    label: "Magasins",
    icon: Warehouse,
    roles: ["admin", "controller", "warehouse_manager"],
  },
  {
    to: "/suppliers",
    label: "Fournisseurs",
    icon: Truck,
    roles: ["admin", "controller", "purchasing"],
  },
  {
    to: "/purchases",
    label: "Achats",
    icon: ClipboardList,
    roles: ["admin", "controller", "purchasing"],
  },
  {
    to: "/purchases",
    label: "Réceptions",
    icon: PackageCheck,
    roles: ["warehouse_manager"],
  },
  {
    to: "/transporteurs",
    label: "Transporteurs",
    icon: Truck,
    roles: ["admin", "controller", "warehouse_manager", "logistics_transport"],
  },
  {
    to: "/pertes-transport",
    label: "Pertes transport",
    icon: PackageX,
    roles: ["admin", "controller", "warehouse_manager", "logistics_transport"],
  },
  {
    to: "/productions",
    label: "Production",
    icon: Factory,
    roles: ["admin", "controller", "production_manager"],
  },
  {
    to: "/transformations",
    label: "Transformation",
    icon: Layers,
    roles: ["admin", "controller", "production_manager"],
  },
  { to: "/stock", label: "Mouvements de stock", icon: ArrowLeftRight },
  { to: "/clients", label: "Clients", icon: Users, roles: ["admin", "controller", "sales_operator"] },
  {
    to: "/orders",
    label: "Commandes",
    icon: ShoppingCart,
    roles: ["admin", "controller", "sales_operator", "supervisor", "accounting"],
  },
  {
    to: "/chart-of-accounts",
    label: "Plan comptable",
    icon: BookOpen,
    roles: ["admin", "controller", "accounting"],
  },
  {
    to: "/journal-comptable",
    label: "Journal comptable",
    icon: NotebookText,
    roles: ["admin", "controller", "accounting"],
  },
  {
    to: "/etats-financiers",
    label: "États financiers",
    icon: LineChart,
    roles: ["admin", "controller", "accounting"],
  },
  {
    to: "/declaration-tva",
    label: "Déclaration TVA",
    icon: Receipt,
    roles: ["admin", "controller", "accounting"],
  },
  { to: "/logs", label: "Journal d'audit", icon: History, roles: ["admin", "controller"] },
  { to: "/users", label: "Utilisateurs", icon: UserCog, roles: ["admin"] },
  { to: "/account", label: "Mon compte", icon: UserCircle },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth();
  useLogPageVisit();

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.roles || (profile && item.roles.includes(profile.role)),
  );

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
        <div className="border-t border-forest-700 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-forest-100/60">
            Environnement
          </p>
          <div className="flex rounded-md bg-forest-800 p-1 text-xs font-semibold">
            <span
              className={clsx(
                "flex-1 rounded px-3 py-1.5 text-center",
                ENV_LABEL === "Réel" ? "bg-cream-50 text-forest-900" : "text-forest-100/60",
              )}
            >
              Réel
            </span>
            <span
              className={clsx(
                "flex-1 rounded px-3 py-1.5 text-center",
                ENV_LABEL !== "Réel" ? "bg-cream-50 text-forest-900" : "text-forest-100/60",
              )}
            >
              Formation
            </span>
          </div>
          <p className="mt-3 text-xs leading-snug text-forest-100/50">
            {ENV_LABEL === "Réel"
              ? "Données réelles partagées entre tous les utilisateurs."
              : "Environnement de formation — données de test, réinitialisables."}
          </p>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-cream-200 bg-cream-50 px-6 py-3">
          <div className="text-sm text-gray-500">
            {profile ? (
              <>
                <span className="font-medium text-gray-800">{profile.email}</span>
                <span className="ml-2 rounded-full bg-forest-50 px-2 py-0.5 text-xs uppercase text-forest-700">
                  {ROLE_LABELS[profile.role]}
                </span>
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
