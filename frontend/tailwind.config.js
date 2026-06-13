/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // Bricolage Grotesque: the personality font — headings, questions, wordmark
        display: ['Bricolage Grotesque', 'system-ui', 'sans-serif'],
        // DM Sans: the workhorse — labels, inputs, buttons, body
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Warm cream background — the canvas
        cream:        '#F7F4EE',
        'cream-dark': '#EDE8DF',
        // The focal card — deep navy, the hero moment
        focal:        '#1A2744',
        'focal-soft': '#243457',
        // Accents — used sparingly for badges, bars, highlights
        'acc-yellow': '#FBBF24',
        'acc-green':  '#34D399',
        'acc-purple': '#A78BFA',
        'acc-coral':  '#FB7185',
        'acc-blue':   '#60A5FA',
        // Text
        ink:          '#151515',
        'ink-soft':   '#5C5449',
        'ink-muted':  '#9B9288',
      },
      borderRadius: {
        // Chunky, friendly corners
        'card': '20px',
        'btn':  '999px',
        'tag':  '999px',
      },
      boxShadow: {
        // Soft lifts — no harsh corporate shadows
        'card': '0 4px 24px rgba(21, 21, 21, 0.08)',
        'btn':  '0 4px 16px rgba(21, 21, 21, 0.15)',
        'focal': '0 8px 40px rgba(26, 39, 68, 0.2)',
      },
    },
  },
  plugins: [],
}
