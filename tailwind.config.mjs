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
        // Brand palette you asked for
        brand: {
          teal: "#196A82",     // bubbles / pill
          aqua: "#C9EEED",     // left panel backdrop
        },
        // Keep "lynk" namespace since globals.css referenced it
        lynk: {
          panelBubble: "#196A82",
          panelBackdrop: "#C9EEED",
        },
      },
      fontFamily: {
        // New utilities you’ll use going forward
        heading: ["var(--font-poppins)", "ui-sans-serif", "system-ui", "sans-serif"],
        body: ["var(--font-poppins)", "ui-sans-serif", "system-ui", "sans-serif"],
        // Safety net so old `font-display` won’t crash builds
        display: ["var(--font-poppins)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        pill: "0 6px 24px rgba(0,0,0,0.18)",
      },
      borderRadius: {
        pill: "9999px",
      },
    },
  },
  plugins: [],
};
