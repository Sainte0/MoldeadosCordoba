import { defineConfig } from 'vitest/config';

// Tests contra una base AISLADA (moldeados_test), nunca la de desarrollo.
export default defineConfig({
  test: {
    globalSetup: './test/global-setup.ts',
    fileParallelism: false,
    env: {
      DATABASE_URL: 'postgres://localhost:5432/moldeados_test',
      MOLDEADOS_DB_NAME: 'moldeados_test',
      JWT_SECRET: 'test_secret_0123456789abcdef',
    },
  },
});
