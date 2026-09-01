/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f2faf7",
          100: "#e2f4ec",
          200: "#c3e8d8",
          300: "#98d6bd",
          400: "#66bd9d",
          500: "#3fa17f",
          600: "#2d8267",
          700: "#256854",
          800: "#205345",
          900: "#1c453a",
        },
        sky: {
          50: "#f0f8fd",
          100: "#dcedf9",
          200: "#bfe0f4",
        },
      },
      fontFamily: {
        sans: ["Inter", "Segoe UI", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
