/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Warna utama: teal tua — identitas aplikasi (bukan biru default)
        primary: {
          50: "#eefaf6",
          100: "#d3f2e8",
          200: "#a3e4d1",
          500: "#14a37e",
          600: "#0f8a6a",
          700: "#0c6e54",
          800: "#0a4f3d",
          900: "#073d30",
        },
        ink: "#1c2a29",
        muted: "#647471",
        line: "#e3ebe8",
        surface: "#f6faf9",
      },
      fontFamily: {
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(7, 61, 48, 0.04), 0 8px 20px -6px rgba(7, 61, 48, 0.12)",
        panel: "0 1px 2px rgba(7, 61, 48, 0.04), 0 8px 20px -6px rgba(7, 61, 48, 0.12)",
        lift: "0 4px 8px rgba(7, 61, 48, 0.06), 0 16px 32px -8px rgba(7, 61, 48, 0.18)",
        button: "0 1px 2px rgba(7, 61, 48, 0.08), 0 4px 10px -2px rgba(7, 61, 48, 0.25)",
      },
    },
  },
  plugins: [],
};
