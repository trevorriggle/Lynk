/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],      // Montserrat
        display: ["var(--font-display)", "var(--font-sans)", "sans-serif"], // Poppins
      },
    },
  },
  plugins: [],
};

};
