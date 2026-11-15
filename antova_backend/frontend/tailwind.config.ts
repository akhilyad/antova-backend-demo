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
      DEFAULT: "4px",
      md: "4px",
      lg: "4px",
      xl: "4px",
      "2xl": "4px",
      full: "9999px",
    },
    extend: {
      colors: {
        background: "#000000",
        surface: {
          DEFAULT: "#09090B",
          card: "#111113",
          elevated: "#18181B",
          border: "#27272A",
          muted: "#3F3F46",
        },
        accent: {
          pass: "#10B981", // emerald-500
          warn: "#F59E0B", // amber-500
          critical: "#EF4444", // rose-500
          info: "#06B6D4", // cyan-500
          highlight: "#8B5CF6", // purple-500
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Inter",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: [
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
