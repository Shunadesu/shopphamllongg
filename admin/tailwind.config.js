/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        slate: {
          850: '#0B1120',
          950: '#020617',
        },
        primary: {
          DEFAULT: '#3B82F6',   // xanh dương — đồng bộ với frontend 🟦
          light:  '#93C5FD',
          dark:   '#1D4ED8',
        },
        price: {
          DEFAULT: '#EAB308',  // vàng — dùng cho giá/khuyến mãi 🟨
          dark: '#CA8A04',
        },
      },
    },
  },
  plugins: [],
}
