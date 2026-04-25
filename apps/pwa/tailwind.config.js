/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        kipi: {
          blue: '#32B4D1',
          aqua: '#32D2BA',
          green: '#32D285',
        },
        primary: {
          DEFAULT: '#32B4D1',
          light: '#32D2BA',
          foreground: '#FFFFFF',
        },
        accent: {
          DEFAULT: '#32D285',
        }
      },
      fontFamily: {
        heading: ['"Bauhaus 93"', 'cursive', 'Arial', 'sans-serif'],
        sans: ['Arial', 'Helvetica', 'sans-serif'],
      }
    },
  },
  plugins: [],
}

