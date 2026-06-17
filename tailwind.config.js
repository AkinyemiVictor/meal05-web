/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/app/**/*.{js,jsx,ts,tsx}",
    "./src/components/**/*.{js,jsx,ts,tsx}",
    "./src/lib/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        meal: {
          ink: "#1a1a2e",
          green: "#22c55e",
          pepper: "#f04e1f",
          blush: "#fff5f2",
          paper: "#ffffff",
          mist: "#f7f8fa",
          line: "#e8edf3",
          muted: "#64748b",
          text: "#000e25",
        },
      },
      boxShadow: {
        meal: "0 18px 40px rgba(26, 26, 46, 0.10)",
        soft: "0 10px 26px rgba(26, 26, 46, 0.08)",
      },
      fontFamily: {
        sans: ["var(--mk-font-sans)"],
        mono: ["var(--mk-font-mono)"],
      },
    },
  },
  plugins: [],
};
