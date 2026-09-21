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
          DEFAULT: '#D84315',   // cam-đỏ — màu thương hiệu 🟧
          light: '#FF6E40',
          dark: '#BF360C',
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
