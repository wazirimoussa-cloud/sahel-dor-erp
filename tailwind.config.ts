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
          400: "#e0ab3a",
          500: "#c8901f",
          600: "#a3711a",
          700: "#7d5716",
          800: "#5c3f10",
        },
        forest: {
          50: "#eef3ef",
          100: "#d7e3da",
          400: "#3a5e46",
          700: "#1c3524",
          800: "#152a1c",
          900: "#0f2115",
          950: "#0a1810",
        },
        cream: {
          50: "#faf7f0",
          100: "#f4ede0",
          200: "#e9decb",
        },
      },
      fontFamily: {
        serif: ["'Playfair Display'", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
