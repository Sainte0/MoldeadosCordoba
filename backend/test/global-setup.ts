import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

// Crea moldeados_test si no existe y corre las migraciones (en un proceso tsx: vitest no importa .ts de knex).
const TEST_URL = 'postgres://localhost:5432/moldeados_test';

export default async function setup(): Promise<void> {
  const admin = new pg.Client({ host: 'localhost', port: 5432, database: 'postgres' });
  await admin.connect();
  const r = await admin.query("select 1 from pg_database where datname = 'moldeados_test'");
  if (r.rowCount === 0) await admin.query('create database moldeados_test');
  await admin.end();
  execFileSync('pnpm', ['exec', 'tsx', 'src/scripts/migrate.ts', 'latest'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: { ...process.env, DATABASE_URL: TEST_URL, JWT_SECRET: 'test_secret_0123456789abcdef' },
    stdio: 'inherit',
  });
}
