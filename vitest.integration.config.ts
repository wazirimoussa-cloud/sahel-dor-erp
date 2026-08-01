import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import path from "node:path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    test: {
      environment: "node",
      include: ["tests/integration/**/*.test.ts"],
      testTimeout: 30000,
      hookTimeout: 30000,
      env,
      // Ces suites partagent le même projet Supabase (Formation) et la même société --
      // en parallèle, un fichier peut créer une écriture comptable pendant qu'un autre
      // compte les écritures existantes, rendant certaines assertions non fiables
      // (observé : production-ledger.test.ts comptait les journal_entries de la société
      // pendant que purchase-to-payment.test.ts en créait une en même temps). Le
      // séquentiel est de toute façon plus sûr pour des tests qui frappent un état
      // externe partagé, au prix d'une suite un peu plus lente.
      fileParallelism: false,
    },
  };
});
