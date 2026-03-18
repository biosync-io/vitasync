import type { Config } from "tailwindcss"

const config: Config = {
  content: ["./src/app/**/*.{ts,tsx}", "./src/lib/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0f0ff",
          100: "#e0e1ff",
          200: "#c7c8fe",
          300: "#a4a5fc",
          400: "#8183f9",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#312e81",
          950: "#1e1b4b",
        },
        vitality: {
          50: "#ecfdf5",
          100: "#d1fae5",
          200: "#a7f3d0",
          300: "#6ee7b7",
          400: "#34d399",
          500: "#10b981",
          600: "#059669",
          700: "#047857",
          800: "#065f46",
          900: "#064e3b",
        },
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "glass-gradient": "linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05))",
        "health-gradient": "linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a78bfa 100%)",
        "score-gradient": "linear-gradient(135deg, #10b981 0%, #34d399 50%, #6ee7b7 100%)",
        "warning-gradient": "linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)",
        "danger-gradient": "linear-gradient(135deg, #ef4444 0%, #f87171 100%)",
      },
      boxShadow: {
        glow: "0 0 20px rgba(99, 102, 241, 0.15)",
        "glow-green": "0 0 20px rgba(16, 185, 129, 0.15)",
        "glow-amber": "0 0 20px rgba(245, 158, 11, 0.15)",
        "glow-red": "0 0 20px rgba(239, 68, 68, 0.15)",
        glass: "0 8px 32px rgba(0, 0, 0, 0.08)",
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-out",
        "slide-up": "slideUp 0.4s ease-out",
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "score-fill": "scoreFill 1s ease-out forwards",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        scoreFill: {
          "0%": { strokeDashoffset: "283" },
          "100%": { strokeDashoffset: "var(--score-offset)" },
        },
      },
    },
  },
  plugins: [],
}

export default config
