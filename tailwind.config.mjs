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
        brand: {
          teal: "#196A82",     // bubbles/pill
          aqua: "#C9EEED",     // left panel backdrop
        },
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
