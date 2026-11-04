import 'dotenv/config';
import pg from 'pg';

// Setup idempotente de la base LOCAL: crea rol y base si no existen. Nunca resetea datos.
const DB_NAME = process.env.MOLDEADOS_DB_NAME ?? 'moldeados_dev';
const APP_PASS = process.env.MOLDEADOS_APP_PASSWORD ?? 'moldeados_dev_pass';
if (!/^moldeados_(dev|test)$/.test(DB_NAME)) throw new Error(`db-setup solo crea bases locales, no "${DB_NAME}"`);

async function main(): Promise<void> {
  const admin = new pg.Client({ host: process.env.PGHOST ?? 'localhost', port: Number(process.env.PGPORT ?? 5432), database: 'postgres' });
  await admin.connect();
  const rol = await admin.query("select 1 from pg_roles where rolname = 'moldeados_app'");
  if (rol.rowCount === 0) await admin.query(`create role moldeados_app login password '${APP_PASS.replace(/'/g, "''")}' nosuperuser nocreatedb nocreaterole`);
  const base = await admin.query('select 1 from pg_database where datname = $1', [DB_NAME]);
  if (base.rowCount === 0) await admin.query(`create database ${DB_NAME} owner moldeados_app`);
  await admin.end();
  console.log(`db-setup OK (${DB_NAME}).`);
}

main().catch((err) => {
  console.error('db-setup falló:', err instanceof Error ? err.message : err);
  process.exit(1);
});
