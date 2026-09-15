/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surveillance: {
          900: '#0b0f19',
          800: '#111827',
          700: '#1f2937',
          600: '#374151',
          accent: '#3b82f6',
          alert: '#ef4444',
          success: '#10b981',
          warning: '#f59e0b',
        }
      }
    },
  },
  plugins: [],
}
