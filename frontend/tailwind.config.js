/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          DEFAULT: '#0B0E14',
          light: '#111827',
          lighter: '#1E293B',
        },
        primary: {
          DEFAULT: '#3B82F6',  // xanh dương pastel — màu thương hiệu 🟦
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
