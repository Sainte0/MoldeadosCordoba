import type { Knex } from 'knex';

// Para buscar sin importar acentos ("alamos" encuentra "Álamos"). Extensión estándar de Postgres.
export async function up(knex: Knex): Promise<void> {
  await knex.raw('create extension if not exists unaccent');
}

export async function down(): Promise<void> {
  // No se borra: otras bases del mismo servidor podrían usarla.
}
