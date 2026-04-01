import { type Config } from "tailwindcss";
import { fontFamily } from "tailwindcss/defaultTheme";

export default {
  darkMode: ["class"],
  content: ["./src/**/*.tsx", "./src/**/*.ts"],
  safelist: [
    // Category badge tokens — safelist ensures they survive JIT purge
    // even when class strings are read from a data object at runtime.
    { pattern: /^bg-category-/ },
    { pattern: /^text-category-/ },
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", ...fontFamily.sans],
      },
      colors: {
        // ── UX-DR1: Stone canvas + category badge tokens ──
        // These are namespaced (canvas.*, surface.*, category.*) to avoid collision
        // with shadcn/ui CSS variable keys (border, accent, primary, destructive, etc.)
        canvas: {
          DEFAULT: "#fafaf9", // stone-50: main page background
        },
        surface: {
          subtle: "#f5f5f4", // stone-100: card/section backgrounds
        },

        // ── UX-DR2: Category badge color pairings ──
        // All pairings verified ≥ 4.5:1 contrast ratio
        // Usage: bg-category-groceries-bg text-category-groceries-text
        category: {
          groceries: {
            bg: "#dcfce7", // green-100
            text: "#15803d", // green-700
          },
          dining: {
            bg: "#ffedd5", // orange-100
            text: "#c2410c", // orange-700
          },
          transport: {
            bg: "#dbeafe", // blue-100
            text: "#1d4ed8", // blue-700
          },
          shopping: {
            bg: "#ede9fe", // violet-100
            text: "#6d28d9", // violet-700
          },
          subscriptions: {
            bg: "#cffafe", // cyan-100
            text: "#0e7490", // cyan-700
          },
          healthcare: {
            bg: "#ffe4e6", // rose-100
            text: "#be123c", // rose-700
          },
          entertainment: {
            bg: "#f3e8ff", // purple-100
            text: "#7e22ce", // purple-700
          },
          utilities: {
            bg: "#f1f5f9", // slate-100
            text: "#334155", // slate-700
          },
        },
        // ── shadcn/ui CSS variable mappings ──
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [],
} satisfies Config;
