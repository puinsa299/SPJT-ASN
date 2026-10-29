/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Warna utama: indigo; aksen warna lain dipakai per menu / per kartu
        primary: {
          50: "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#1e1b4b",
        },
        ink: "#0f172a",
        muted: "#64748b",
        line: "#e2e8f0",
        surface: "#f4f6fb",
      },
      fontFamily: {
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 20px -6px rgba(15, 23, 42, 0.12)",
        panel: "0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 20px -6px rgba(15, 23, 42, 0.12)",
        lift: "0 4px 8px rgba(15, 23, 42, 0.06), 0 16px 32px -8px rgba(15, 23, 42, 0.18)",
        button: "0 1px 2px rgba(15, 23, 42, 0.08), 0 4px 10px -2px rgba(15, 23, 42, 0.25)",
      },
    },
  },
  plugins: [],
};
