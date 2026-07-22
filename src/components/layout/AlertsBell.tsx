import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAlerts } from "@/features/alerts/useAlerts";

export function AlertsBell() {
  const { data } = useAlerts();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const lowStockCount = data?.lowStockCount ?? 0;
  const pendingOrdersCount = data?.pendingOrdersCount ?? 0;
  const unpaidOrdersCount = data?.unpaidOrdersCount ?? 0;
  const expiringLotsCount = data?.expiringLotsCount ?? 0;
  const total = lowStockCount + pendingOrdersCount + unpaidOrdersCount + expiringLotsCount;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative rounded-md p-2 text-gray-500 hover:bg-gray-100"
        aria-label="Alertes"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="h-5 w-5"
        >
          <path d="M12 2a6 6 0 0 0-6 6v3.586l-1.707 1.707A1 1 0 0 0 5 15h14a1 1 0 0 0 .707-1.707L18 11.586V8a6 6 0 0 0-6-6Zm0 20a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Z" />
        </svg>
        {total > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            {total}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-10 mt-2 w-72 rounded-md border border-gray-200 bg-white p-3 shadow-lg">
          <p className="mb-2 text-xs font-medium uppercase text-gray-500">Alertes</p>
          {total === 0 && <p className="text-sm text-gray-400">Aucune alerte pour le moment.</p>}
          <ul className="space-y-2 text-sm">
            {lowStockCount > 0 && (
              <li>
                <Link to="/products" onClick={() => setOpen(false)} className="text-brand-600 hover:underline">
                  {lowStockCount} produit{lowStockCount > 1 ? "s" : ""} en stock bas
                </Link>
              </li>
            )}
            {pendingOrdersCount > 0 && (
              <li>
                <Link to="/orders" onClick={() => setOpen(false)} className="text-brand-600 hover:underline">
                  {pendingOrdersCount} commande{pendingOrdersCount > 1 ? "s" : ""} en attente
                </Link>
              </li>
            )}
            {unpaidOrdersCount > 0 && (
              <li>
                <Link to="/orders" onClick={() => setOpen(false)} className="text-brand-600 hover:underline">
                  {unpaidOrdersCount} commande{unpaidOrdersCount > 1 ? "s" : ""} impayée
                  {unpaidOrdersCount > 1 ? "s" : ""}
                </Link>
              </li>
            )}
            {expiringLotsCount > 0 && (
              <li>
                <Link to="/stock" onClick={() => setOpen(false)} className="text-brand-600 hover:underline">
                  {expiringLotsCount} lot{expiringLotsCount > 1 ? "s" : ""} expirant sous 30 jours
                </Link>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
