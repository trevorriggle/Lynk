/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./pages/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
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
        pill: "0 1px 2px rgba(0,0,0,0.08)",
        input: "inset 0 1px 2px rgba(0,0,0,0.06)",
      },
      borderRadius: { pill: "9999px" },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
