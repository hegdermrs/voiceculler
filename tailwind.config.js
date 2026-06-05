/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        stage: "#0a0a0a",
        keep: "#22c55e",
        reject: "#ef4444",
      },
      keyframes: {
        "flash-in": {
          "0%": { opacity: "0", transform: "scale(0.9)" },
          "20%": { opacity: "1", transform: "scale(1)" },
          "100%": { opacity: "0", transform: "scale(1.05)" },
        },
        pulse_ring: {
          "0%": { transform: "scale(0.95)", opacity: "0.7" },
          "70%": { transform: "scale(1.3)", opacity: "0" },
          "100%": { transform: "scale(1.3)", opacity: "0" },
        },
      },
      animation: {
        "flash-in": "flash-in 0.7s ease-out forwards",
        "pulse-ring": "pulse_ring 1.5s ease-out infinite",
      },
    },
  },
  plugins: [],
};
