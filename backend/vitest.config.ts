import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts'],
    // Generous enough for round-tripping to a remote/serverless Postgres (e.g. Neon) with
    // several sequential queries per test, not just near-instant local SQLite.
    testTimeout: 45000,
    hookTimeout: 45000,
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
    },
  },
});
