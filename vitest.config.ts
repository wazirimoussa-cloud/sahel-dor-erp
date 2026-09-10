import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    globals: true,
    // Valeurs factices : les tests unitaires ne joignent jamais Supabase (client mocké ou
    // inutilisé), mais src/lib/supabase.ts lève au chargement si ces variables manquent.
    // Sans ça, la suite passe en local (via .env.local) mais échoue en CI (pas de .env.local).
    env: {
      VITE_SUPABASE_URL: "https://placeholder.supabase.co",
      VITE_SUPABASE_ANON_KEY: "placeholder-anon-key",
    },
  },
});
