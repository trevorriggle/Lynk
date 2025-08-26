/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./pages/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: { teal: "#196A82", aqua: "#C9EEED" },
      },
      fontFamily: {
        heading: ["var(--font-poppins)", "ui-sans-serif", "system-ui", "sans-serif"],
        body: ["var(--font-poppins)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-poppins)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: { pill: "0 6px 24px rgba(0,0,0,0.18)" },
      borderRadius: { pill: "9999px" },
    },
  },
  plugins: [],
};
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        lynk: {
          teal: "#176A82",   // brand teal
          aqua: "#C7EBEA",   // sidebar aqua
        },
      },
      boxShadow: {
        header: "inset 0 1px 0 rgba(255,255,255,0.35)",
        pill: "0 1px 2px rgba(0,0,0,0.08)",
        input: "inset 0 1px 2px rgba(0,0,0,0.06)",
      },
      borderRadius: {
        pill: "9999px",
      },
    },
  },
  plugins: [],
};
