import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

export default defineConfig({
  // Mirror tsup's version injection so tests exercise the real User-Agent.
  define: { __NOMBAONE_SDK_VERSION__: JSON.stringify(pkg.version) },
  test: {
    include: ['test/**/*.test.ts'],
    // Integration tests hit a live sandbox API; they only run when explicitly
    // requested via `pnpm test:integration` with NOMBAONE_INTEGRATION=1.
    exclude: process.env.NOMBAONE_INTEGRATION ? [] : ['test/integration/**'],
    environment: 'node',
    restoreMocks: true,
  },
});
