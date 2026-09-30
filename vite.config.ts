/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Bind IPv4 explicitly: plain "localhost" can end up IPv6-only on Windows,
// letting another app on 127.0.0.1 answer the same port instead of us.
const HOST = '127.0.0.1'
// Override to run several checkouts (e.g. git worktrees) side by side:
//   KINETIC_PORT=5341 npm run dev   (the dev scripts take KINETIC_URL to match)
const PORT = Number(process.env.KINETIC_PORT) || 5317

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: HOST,
    port: PORT,
    strictPort: true,
  },
  preview: {
    host: HOST,
    port: PORT + 1,
    strictPort: true,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
