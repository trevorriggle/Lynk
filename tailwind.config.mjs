/** @type {import('tailwindcss').Config} */
import typography from '@tailwindcss/typography';

export default {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./pages/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // keep both namespaces so nothing breaks
        brand: { teal: "#196A82", aqua: "#C9EEED" },
        lynk:  { teal: "#176A82", aqua: "#C7EBEA" },
      },
      fontFamily: {
        heading: ["var(--font-poppins)", "ui-sans-serif", "system-ui", "sans-serif"],
        body:    ["var(--font-poppins)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-poppins)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        header: "inset 0 1px 0 rgba(255,255,255,0.35)",
        pill: "0 1px 2px rgba(0,0,0,0.08)",   // subtle pill shadow
        input: "inset 0 1px 2px rgba(0,0,0,0.06)",
      },
      borderRadius: { pill: "9999px" },
      typography: (theme) => ({
        DEFAULT: {
          css: {
            color: theme("colors.slate.800"),
            a: { color: theme("colors.brand.teal"), textDecoration: "underline" },
            code: { backgroundColor: theme("colors.slate.100"), padding: "0.125rem 0.25rem", borderRadius: "0.25rem" },
            pre:  { backgroundColor: theme("colors.slate.100"), borderRadius: "0.375rem", padding: "0.5rem" },
          },
        },
        sm: {
          css: { h1: { fontSize: "1.125rem" }, h2: { fontSize: "1rem" }, h3: { fontSize: "0.95rem" } },
        },
      }),
    },
  },
  plugins: [typography],
};
