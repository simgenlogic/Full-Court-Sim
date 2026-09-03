import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  base: '/Full-Court-Sim/',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // A few statistical tests simulate 100+ full games; CI runners can be meaningfully slower
    // than local dev, so give them real headroom past vitest's 5s default.
    testTimeout: 20_000,
  },
})
