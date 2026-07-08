import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import clsx from "clsx";
import { useAuth } from "@/auth/useAuth";
import { Button } from "@/components/ui/Button";
import { EnvBanner } from "@/components/layout/EnvBanner";
import type { RoleName } from "@/lib/database.types";

interface NavItem {
  to: string;
  label: string;
  roles?: RoleName[];
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Tableau de bord" },
  { to: "/products", label: "Produits" },
  { to: "/warehouses", label: "Magasins", roles: ["admin", "manager"] },
  { to: "/suppliers", label: "Fournisseurs", roles: ["admin", "manager"] },
  { to: "/purchases", label: "Achats", roles: ["admin", "manager"] },
  { to: "/productions", label: "Production", roles: ["admin", "manager"] },
  { to: "/transformations", label: "Transformation", roles: ["admin", "manager"] },
  { to: "/stock", label: "Mouvements de stock" },
  { to: "/orders", label: "Commandes", roles: ["admin", "manager", "seller"] },
  { to: "/logs", label: "Journal d'audit", roles: ["admin", "auditor"] },
  { to: "/users", label: "Utilisateurs", roles: ["admin"] },
  { to: "/account", label: "Mon compte" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth();

  const visibleItems = NAV_ITEMS.filter((item) => !item.roles || (profile && item.roles.includes(profile.role)));

  return (
    <div className="flex min-h-screen flex-col">
      <EnvBanner />
      <div className="flex flex-1">
        <aside className="w-56 shrink-0 border-r border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-4 py-4">
            <span className="text-lg font-semibold text-brand-700">Sahel d'Or</span>
          </div>
          <nav className="flex flex-col gap-1 p-2">
            {visibleItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  clsx(
                    "rounded-md px-3 py-2 text-sm font-medium",
                    isActive ? "bg-brand-50 text-brand-700" : "text-gray-600 hover:bg-gray-50",
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        <div className="flex flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
            <div className="text-sm text-gray-500">
              {profile ? (
                <>
                  <span className="font-medium text-gray-800">{profile.email}</span>
                  <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs uppercase text-gray-500">
                    {profile.role}
                  </span>
                </>
              ) : (
                "Profil en cours de chargement…"
              )}
            </div>
            <Button variant="secondary" onClick={() => void signOut()}>
              Déconnexion
            </Button>
          </header>

          <main className="flex-1 bg-gray-50 p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
