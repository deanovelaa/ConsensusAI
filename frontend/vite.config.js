import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite config: tells the dev server how to behave.
// The proxy section is key — it forwards any request starting with /api
// from the React dev server (port 5173) to the FastAPI backend (port 8000).
// This means in our React code we can write fetch('/api/vote/...') instead of
// fetch('http://localhost:8000/api/vote/...'), which is cleaner and avoids CORS issues.

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
