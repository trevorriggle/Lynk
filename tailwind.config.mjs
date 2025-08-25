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
        // Fredoka Variable from Adobe Fonts
        sans: ["fredoka-variable", "system-ui", "sans-serif"],
        // If you want a separate "display" family you can alias it here,
        // otherwise both body and headings can just use sans.
        display: ["fredoka-variable", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
