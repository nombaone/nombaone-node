import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Integration tests hit a live sandbox API; they only run when explicitly
    // requested via `pnpm test:integration` with NOMBAONE_INTEGRATION=1.
    exclude: process.env.NOMBAONE_INTEGRATION ? [] : ['test/integration/**'],
    environment: 'node',
    restoreMocks: true,
  },
});
