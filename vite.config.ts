import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
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
        // Fonction plutôt que l'ancienne forme objet (Rollup 5, via Vite 8) : le typage ne
        // reconnaît plus les clés de chunk arbitraires dans ManualChunksFunction. react-router
        // (v7) est désormais un paquet séparé de react-router-dom (avant : un seul paquet) --
        // ajouté ici pour rester dans le même chunk vendor.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom)[\\/]/.test(id)) {
            return "react-vendor";
          }
          if (/[\\/]node_modules[\\/]@supabase[\\/]supabase-js[\\/]/.test(id)) {
            return "supabase-vendor";
          }
          if (/[\\/]node_modules[\\/]@tanstack[\\/]react-query[\\/]/.test(id)) {
            return "query-vendor";
          }
          if (/[\\/]node_modules[\\/](react-hook-form|zod|@hookform[\\/]resolvers)[\\/]/.test(id)) {
            return "form-vendor";
          }
          return undefined;
        },
      },
    },
  },
});
