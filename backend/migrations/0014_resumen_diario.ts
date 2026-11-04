import type { Knex } from 'knex';

// Resumen diario por mail: a quiénes, a qué hora, y la última fecha enviada (para mandarlo una sola vez por día
// aunque el servidor se reinicie).
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('empresa', (t) => {
    t.text('resumen_emails'); // separados por coma; vacío = no se manda
    t.integer('resumen_hora').notNullable().defaultTo(20);
    t.date('resumen_enviado');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('empresa', (t) => { t.dropColumn('resumen_emails'); t.dropColumn('resumen_hora'); t.dropColumn('resumen_enviado'); });
}
