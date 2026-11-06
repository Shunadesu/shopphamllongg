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
          // #2563EB: chữ trắng trên nền primary = 5.17:1 (đạt WCAG AA).
          // #3B82F6 cũ chỉ 3.68:1 → fail color-contrast ở 26 phần tử.
          DEFAULT: '#2563EB',
          light:  '#93C5FD',
          dark:   '#1E40AF',
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
