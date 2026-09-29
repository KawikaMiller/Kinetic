import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Bind IPv4 explicitly: plain "localhost" can end up IPv6-only on Windows,
    // letting another app on 127.0.0.1 answer the same port instead of us.
    host: '127.0.0.1',
    port: 5317,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 5318,
    strictPort: true,
  },
})
