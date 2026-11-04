import type { Knex } from 'knex';

// Saldos iniciales de cuentas corrientes: lo que cada cliente debía (o cada proveedor nos cobraba) el día que se
// empezó a usar el sistema. Positivo = deuda (el cliente nos debe / le debemos al proveedor). Se cargan importando
// el Excel de saldos; se anulan, no se borran.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('saldos_iniciales', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('cliente_id').references('clientes.id').onDelete('RESTRICT');
    t.uuid('proveedor_id').references('proveedores.id').onDelete('RESTRICT');
    t.date('fecha').notNullable();
    t.bigInteger('monto_centavos').notNullable();
    t.text('nota');
    t.uuid('usuario_id').notNullable().references('usuarios.id').onDelete('RESTRICT');
    t.timestamp('anulado_at', { useTz: true });
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(['cliente_id']);
    t.index(['proveedor_id']);
  });
  await knex.raw('alter table saldos_iniciales add constraint saldos_uno_check check ((cliente_id is null) <> (proveedor_id is null))');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('saldos_iniciales');
}
