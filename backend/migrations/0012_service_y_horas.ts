import type { Knex } from 'knex';

// Service de máquinas por horas trabajadas (las horas salen de los partes) y valor hora del personal de planta
// para estimar lo que corresponde pagar según las horas en los partes.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('maquinas', (t) => {
    t.integer('service_cada_horas'); // null = sin aviso
  });
  await knex.schema.createTable('servicios_maquina', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('maquina_id').notNullable().references('maquinas.id').onDelete('RESTRICT');
    t.date('fecha').notNullable();
    t.text('nota');
    t.uuid('usuario_id').notNullable().references('usuarios.id').onDelete('RESTRICT');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(['maquina_id', 'fecha']);
  });
  await knex.schema.alterTable('empleados', (t) => {
    t.bigInteger('valor_hora_centavos'); // null = no se estima
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('empleados', (t) => t.dropColumn('valor_hora_centavos'));
  await knex.schema.dropTableIfExists('servicios_maquina');
  await knex.schema.alterTable('maquinas', (t) => t.dropColumn('service_cada_horas'));
}
