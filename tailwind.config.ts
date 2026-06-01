import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "-apple-system",
          "BlinkMacSystemFont",
          "Inter",
          "SF Pro Text",
          "Segoe UI",
          "sans-serif",
        ],
        display: ["var(--font-display)", "ui-sans-serif", "sans-serif"],
      },
      colors: {
        ink: {
          DEFAULT: "rgb(var(--ink-rgb) / <alpha-value>)",
          soft: "rgb(var(--ink-soft-rgb) / <alpha-value>)",
          muted: "rgb(var(--ink-muted-rgb) / <alpha-value>)",
        },
        canvas: {
          DEFAULT: "rgb(var(--canvas-rgb) / <alpha-value>)",
          warm: "rgb(var(--canvas-warm-rgb) / <alpha-value>)",
        },
      },
      backdropBlur: { xs: "2px" },
      animation: {
        "fade-in": "fadeIn 220ms ease-out both",
        "fade-up": "fadeUp 260ms cubic-bezier(.2,.7,.2,1) both",
        pop: "pop 260ms cubic-bezier(.2,.9,.3,1.2) both",
      },
      keyframes: {
        fadeIn: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pop: {
          "0%": { transform: "scale(.98)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
