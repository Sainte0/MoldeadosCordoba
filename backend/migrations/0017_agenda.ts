import type { Knex } from 'knex';

// Agenda y avisos: recordatorios para una o varias personas (o para todos), con repetición; avisos por usuario
// (la campana) y suscripciones para que el teléfono los muestre aunque la app esté cerrada (Web Push).
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('recordatorios', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('titulo').notNullable();
    t.text('detalle');
    t.date('fecha').notNullable(); // primera vez
    t.text('hora'); // 'HH:MM'; null = en el día, se avisa a las 8
    t.enu('repetir', ['no', 'diario', 'semanal', 'mensual'], { useNative: true, enumName: 'repeticion' }).notNullable().defaultTo('no');
    t.boolean('para_todos').notNullable().defaultTo(false);
    t.uuid('creado_por').notNullable().references('usuarios.id').onDelete('RESTRICT');
    t.date('avisado_hasta'); // última fecha cuyo aviso ya salió (no se avisa dos veces)
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('deleted_at', { useTz: true });
  });
  await knex.raw(`alter table recordatorios add constraint recordatorios_hora check (hora is null or hora ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')`);
  await knex.schema.createTable('recordatorio_usuarios', (t) => {
    t.uuid('recordatorio_id').notNullable().references('recordatorios.id').onDelete('RESTRICT');
    t.uuid('usuario_id').notNullable().references('usuarios.id').onDelete('RESTRICT');
    t.primary(['recordatorio_id', 'usuario_id']);
    t.index('usuario_id');
  });
  // Hecho por fecha: en uno que se repite, cada día/semana/mes se marca aparte. Lo marca uno y vale para todos.
  await knex.schema.createTable('recordatorio_hechos', (t) => {
    t.uuid('recordatorio_id').notNullable().references('recordatorios.id').onDelete('RESTRICT');
    t.date('fecha').notNullable();
    t.uuid('usuario_id').notNullable().references('usuarios.id').onDelete('RESTRICT');
    t.timestamp('hecho_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.primary(['recordatorio_id', 'fecha']);
  });
  await knex.schema.createTable('notificaciones', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('usuario_id').notNullable().references('usuarios.id').onDelete('RESTRICT');
    t.text('tipo').notNullable();
    t.text('titulo').notNullable();
    t.text('detalle');
    t.text('ruta');
    t.timestamp('leida_at', { useTz: true });
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(['usuario_id', 'created_at']);
  });
  await knex.schema.createTable('push_suscripciones', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('usuario_id').notNullable().references('usuarios.id').onDelete('RESTRICT');
    t.text('endpoint').notNullable().unique();
    t.text('p256dh').notNullable();
    t.text('auth').notNullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.schema.alterTable('empresa', (t) => {
    t.text('vapid_publica');
    t.text('vapid_privada');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('empresa', (t) => { t.dropColumn('vapid_publica'); t.dropColumn('vapid_privada'); });
  for (const x of ['push_suscripciones', 'notificaciones', 'recordatorio_hechos', 'recordatorio_usuarios', 'recordatorios']) await knex.schema.dropTable(x);
  await knex.raw('drop type repeticion');
}
