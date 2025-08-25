/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        lynk: {
          bg: "#FFFFFF",          // overall background
          panel: "#C7EBEA",       // left panel backdrop
          panelBubble: "#176A82", // left panel bubbles
          agent: "#C7EBEA",       // agent message bubble
          user: "#D9D9D9",        // "You" bubble
          ink: "#1F2937",         // dark neutral text
        },
      },
      fontFamily: {
        sans: ["var(--font-poppins)", "system-ui", "sans-serif"],   // Poppins for body
        display: ["var(--font-poppins)", "system-ui", "sans-serif"],// Poppins Black for headings
      },
      fontWeight: {
        black: "900", // used for headings
      },
      borderRadius: {
        xl: "0.9rem",
        "2xl": "1.25rem",
      },
      boxShadow: {
        soft: "0 1px 3px rgba(0,0,0,0.06)",
      },
    },
  },
  plugins: [],
};
