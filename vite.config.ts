/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { watchIgnoreGlobs } from './scripts/lib/watch-ignore.ts'

// Bind IPv4 explicitly: plain "localhost" can end up IPv6-only on Windows,
// letting another app on 127.0.0.1 answer the same port instead of us.
const HOST = '127.0.0.1'
// Override to run several checkouts (e.g. git worktrees) side by side:
//   KINETIC_PORT=5341 npm run dev   (the dev scripts take KINETIC_URL to match)
const PORT = Number(process.env.KINETIC_PORT) || 5317

// Port safety: the dev server says which checkout it serves, and the browser scripts
// (smoke, shot, captions) abort when it isn't theirs. Keep the path in sync with
// ROOT_ENDPOINT in scripts/lib/root.mjs.
function kineticRoot(): Plugin {
  return {
    name: 'kinetic-root',
    configureServer(server) {
      server.middlewares.use('/__kinetic_root', (_req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ root: server.config.root }))
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), kineticRoot()],
  server: {
    host: HOST,
    port: PORT,
    strictPort: true,
    // Added to Vite's own ignores (.git, node_modules), not replacing them. Anchored to this config's
    // folder so a dev server rooted inside a worktree still watches its own files.
    watch: { ignored: watchIgnoreGlobs(fileURLToPath(new URL('.', import.meta.url))) },
  },
  preview: {
    host: HOST,
    port: PORT + 1,
    strictPort: true,
  },
  test: {
    // dev-script rules (scripts/lib) are tested too, not just app code
    include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'],
    environment: 'node',
    // Exhaustive lesson tests run a few seconds each; with 300+ lessons and several
    // checkouts testing at once, a heavy seeded-schedule check can pass 15 s under load.
    testTimeout: 45_000,
    // Browser-driven suites (the sweep self-test) start and stop Chromium in hooks, which the 10 s default
    // cuts off when other agents are testing on the same machine.
    hookTimeout: 120_000,
  },
})
