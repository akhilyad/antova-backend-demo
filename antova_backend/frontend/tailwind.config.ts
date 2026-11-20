import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    borderRadius: {
      none: "0",
      sm: "2px",
      DEFAULT: "6px",
      md: "8px",
      lg: "10px",
      xl: "12px",
      "2xl": "16px",
      full: "9999px",
      // Institutional radius tokens
      cell: "4px",
      input: "6px",
      btn: "6px",
      dropdown: "8px",
      card: "10px",
      drawer: "12px",
      dialog: "12px",
    },
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        antova: {
          chrome: "#172536",    // Sidebar / dark navigation chrome
          bg: "#F4F6F8",        // Light canvas background
          canvas: "#F4F6F8",
          surface: "#FFFFFF",   // Cards, tables, panels
          primary: "#182433",   // Deep navy main content text
          secondary: "#667487", // Slate secondary labels/metadata
          border: "#DCE2E8",    // Subtle light border
          accent: "#34495E",    // Slate accent for primary buttons
          bronze: "#B8894D",    // Restrained brand accent
          success: "#278765",   // Verified / success green
          warning: "#B7791F",   // Warning / needs review amber
          danger: "#B94A48",    // Anomaly / risk red
        },
        surface: {
          DEFAULT: "#09090B",
          card: "#111113",
          elevated: "#18181B",
          border: "#27272A",
          muted: "#3F3F46",
        },
        accent: {
          pass: "#10B981",
          warn: "#F59E0B",
          critical: "#EF4444",
          info: "#06B6D4",
          highlight: "#8B5CF6",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-geist)",
          "-apple-system",
          "BlinkMacSystemFont",
          "Inter",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        serif: ["var(--font-source-serif)", "Georgia", "Cambria", "serif"],
        mono: [
          "var(--font-geist-mono)",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "Liberation Mono",
          "Courier New",
          "monospace",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
