import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/db/**/*.test.ts'],
    setupFiles: ['./tests/db/setup.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
