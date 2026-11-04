import type { Knex } from 'knex';

// Hora de Argentina para la base entera, no solo para las conexiones de la app: así psql, los backups, una
// consulta a mano o cualquier herramienta ven now()/current_date en hora argentina. (Las columnas son timestamptz:
// guardan el instante exacto; esto define cómo se muestra y qué es "hoy".)
// Córdoba y Buenos Aires tienen la misma hora (-03:00, sin horario de verano): se usa Buenos_Aires, como en el
// resto de los sistemas.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`do $$ begin execute format('alter database %I set timezone to %L', current_database(), 'America/Argentina/Buenos_Aires'); end $$`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`do $$ begin execute format('alter database %I reset timezone', current_database()); end $$`);
}
