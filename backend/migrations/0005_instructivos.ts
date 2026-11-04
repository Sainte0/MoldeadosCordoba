import type { Knex } from 'knex';

// Corte 5: instructivos editables. El texto de fábrica vive en cada asistente; acá solo lo que el dueño cambió,
// con clave "<proceso>:<título del paso>". Borrar la fila = volver al texto original.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('instructivos', (t) => {
    t.text('clave').primary();
    t.text('texto').notNullable();
    t.uuid('usuario_id').notNullable().references('usuarios.id').onDelete('RESTRICT');
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('instructivos');
}
