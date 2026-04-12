import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts', 'plugins/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: [
        'dist/**',
        'prisma/**',
        'tests/**',
        'vitest.config.ts',
        '**/*.d.ts',
        'src/index.ts',
        'src/scripts/**',
        'src/seeders/**',
      ],
    },
  },
});
