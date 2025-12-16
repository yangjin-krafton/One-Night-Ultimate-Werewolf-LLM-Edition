/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Space Grotesk"', 'Inter', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif']
      },
      colors: {
        midnight: '#0b1021',
        aurora: '#6dd5ed',
        ember: '#f77062'
      },
      boxShadow: {
        glow: '0 15px 40px rgba(0,0,0,0.45)',
        neon: '0 0 0 1px rgba(255,255,255,0.05), 0 10px 50px rgba(0, 202, 255, 0.18)'
      }
    }
  },
  plugins: []
};
