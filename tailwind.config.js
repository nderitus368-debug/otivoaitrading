/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./index.html",
  ],
  theme: {
    extend: {
      colors: {
        'deriv-red': '#ff444f',
        'deriv-teal': '#00a79e',
        'deriv-black': '#0e0e0e',
      }
    },
  },
  plugins: [],
}
