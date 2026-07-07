import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#fff9eb",
          100: "#fdeec7",
          200: "#f9d786",
          300: "#f4bd4a",
          500: "#c8901f",
          600: "#a3711a",
          700: "#7d5716",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
