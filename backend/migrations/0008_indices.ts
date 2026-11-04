import type { Knex } from 'knex';

// Índices que faltaban, encontrados con EXPLAIN sobre una base con volumen de años (src/scripts/bench.ts):
// búsquedas por columnas que no son el primer campo de una clave.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('palet_lotes', (t) => t.index(['parte_id'])); // ¿en qué palets está este parte?
  await knex.schema.alterTable('palets', (t) => t.index(['venta_id'])); // palets de una venta / vendidos
  await knex.schema.alterTable('parte_consumos', (t) => t.index(['materia_prima_id'])); // costo y trazabilidad por materia
  await knex.schema.alterTable('venta_items', (t) => t.index(['variante_id'])); // margen por código
  await knex.schema.alterTable('movimientos_stock', (t) => t.index(['parte_id'])); // anular un parte
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('palet_lotes', (t) => t.dropIndex(['parte_id']));
  await knex.schema.alterTable('palets', (t) => t.dropIndex(['venta_id']));
  await knex.schema.alterTable('parte_consumos', (t) => t.dropIndex(['materia_prima_id']));
  await knex.schema.alterTable('venta_items', (t) => t.dropIndex(['variante_id']));
  await knex.schema.alterTable('movimientos_stock', (t) => t.dropIndex(['parte_id']));
}
