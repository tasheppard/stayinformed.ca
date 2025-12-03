import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Party colors
        conservative: '#1A4782',
        liberal: '#D71920',
        ndp: '#F5821F',
        bloc: '#00AFB3',
        green: '#3D9B35',
        independent: '#6B7280',
        // Score colors
        scoreHigh: '#10B981', // Green for high scores (80-100)
        scoreMedium: '#F59E0B', // Amber for medium scores (50-79)
        scoreLow: '#EF4444', // Red for low scores (0-49)
      },
    },
  },
  plugins: [],
}
export default config

