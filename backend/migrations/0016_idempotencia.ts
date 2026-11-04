import type { Knex } from 'knex';

// Cargas hechas sin señal: el teléfono las guarda y las reenvía cuando vuelve la conexión, cada una con una clave
// única (Idempotency-Key). Si el primer envío llegó pero se perdió la respuesta, el reintento devuelve lo mismo
// en vez de cargar dos veces.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('solicitudes_idempotentes', (t) => {
    t.text('clave').primary();
    t.uuid('usuario_id');
    t.text('ruta').notNullable();
    t.integer('status').notNullable();
    t.jsonb('respuesta');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(['created_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('solicitudes_idempotentes');
}
