import { fileURLToPath } from 'node:url';
import knex, { type Knex } from 'knex';
import pg from 'pg';
import { env } from './config/env.js';

// bigint (int8) llega como string por default: nuestras cantidades (centavos, gramos) entran holgadas en un
// Number. `date` se deja como texto 'YYYY-MM-DD' para que ningún huso horario corra el día.
pg.types.setTypeParser(20, Number);
pg.types.setTypeParser(1082, (v) => v);

export const knexConfig: Knex.Config = {
  client: 'pg',
  connection: env.DATABASE_URL,
  pool: {
    min: 0,
    max: 10,
    // CURRENT_DATE y now()::date en hora Argentina, no del servidor.
    afterCreate: (conn: pg.Client, done: (err: Error | null, conn: pg.Client) => void) => {
      conn.query("SET TIME ZONE 'America/Argentina/Buenos_Aires'", (err) => done(err, conn));
    },
  },
  migrations: {
    directory: fileURLToPath(new URL('../migrations', import.meta.url)),
    extension: 'ts',
    loadExtensions: ['.ts'],
  },
};

export const db = knex(knexConfig);
