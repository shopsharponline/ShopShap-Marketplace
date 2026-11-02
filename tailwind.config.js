/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#e6f7ee',
          100: '#c2ecd9',
          200: '#8fdfba',
          300: '#55d298',
          400: '#2bc47c',
          500: '#00a651',
          600: '#008c45',
          700: '#00713a',
          800: '#00572e',
          900: '#003d20',
        },
        ink: {
          50: '#f7f8f8',
          100: '#eef0f0',
          200: '#dfe2e2',
          300: '#c6cbcb',
          400: '#a3abab',
          500: '#7d8787',
          600: '#616969',
          700: '#4d5353',
          800: '#2b3131',
          900: '#161919',
        },
      },
    },
  },
  plugins: [],
};
