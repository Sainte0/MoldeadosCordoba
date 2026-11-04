import type { Knex } from 'knex';

// Recuperar la contraseña con un código por mail: el mail de cada usuario y los códigos (guardados con hash, vencen a
// los 15 minutos, se usan una vez y se bloquean tras 5 intentos fallidos).
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('usuarios', (t) => { t.text('email'); });
  await knex.raw('create unique index usuarios_email_uq on usuarios (lower(email)) where deleted_at is null and email is not null');
  await knex.schema.createTable('codigos_recuperacion', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('usuario_id').notNullable().references('usuarios.id').onDelete('RESTRICT');
    t.text('codigo_hash').notNullable();
    t.timestamp('expira_at', { useTz: true }).notNullable();
    t.integer('intentos').notNullable().defaultTo(0);
    t.timestamp('usado_at', { useTz: true });
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(['usuario_id', 'created_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('codigos_recuperacion');
  await knex.raw('drop index if exists usuarios_email_uq');
  await knex.schema.alterTable('usuarios', (t) => { t.dropColumn('email'); });
}
