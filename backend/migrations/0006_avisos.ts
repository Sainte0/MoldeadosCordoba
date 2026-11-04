import type { Knex } from 'knex';

// Avisos: cuándo se contactó por última vez a un cliente (para no repetir el aviso de recompra) y con cuántos días
// de stock por delante avisar que hay que comprar cada materia prima.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('clientes', (t) => {
    t.timestamp('contactado_at', { useTz: true });
  });
  await knex.schema.alterTable('materias_primas', (t) => {
    t.integer('dias_aviso').notNullable().defaultTo(7);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('clientes', (t) => t.dropColumn('contactado_at'));
  await knex.schema.alterTable('materias_primas', (t) => t.dropColumn('dias_aviso'));
}
