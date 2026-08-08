import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    // Integration tests share one in-memory MongoDB instance per file; running
    // files in a single fork keeps that predictable and fast on CI.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Thresholds gate the calculation engine specifically — the brief calls
      // it the highest-value test surface, and it is the one module where a
      // silent regression produces wrong money rather than a visible error.
      // Validation schemas are reported for visibility but not gated: they are
      // exercised end-to-end through the API tests, and chasing a number here
      // would mean unit-testing Zod rather than the rules that matter.
      include: ['src/lib/pricing/**'],
      exclude: ['**/*.test.ts', '**/index.ts', '**/types.ts'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
});
