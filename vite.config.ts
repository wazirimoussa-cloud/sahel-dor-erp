import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Vendor code séparé du code applicatif : ces dépendances changent rarement d'une
        // release à l'autre, contrairement aux pages (routes.tsx charge déjà chaque page en
        // lazy() séparément). Sans ce découpage, tout finissait dans un seul chunk
        // "index-*.js" de ~550 kB — un simple changement dans une page invalidait le cache
        // navigateur de React/Supabase/etc. pour rien. Chaque chunk nommé ici est
        // <link rel="modulepreload"> dès index.html, donc chargé sur TOUTE page, y compris
        // /login -- volontairement limité aux dépendances déjà utilisées par le chemin
        // critique (App/LoginPage sont statiques, pas lazy). recharts n'y figure PAS : il
        // ne sert qu'au Tableau de bord (seul à l'importer) et reste dans le chunk lazy de
        // cette page (routes.tsx) pour ne jamais peser sur les pages qui ne l'utilisent pas.
        manualChunks: {
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          "supabase-vendor": ["@supabase/supabase-js"],
          "query-vendor": ["@tanstack/react-query"],
          "form-vendor": ["react-hook-form", "zod", "@hookform/resolvers"],
        },
      },
    },
  },
});
