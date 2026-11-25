import type { Knex } from 'knex';

// La orden de venta puede salir de un pedido: al cerrarla, sus ventas quedan ligadas al pedido y el pedido se da por
// entregado cuando se lleva todo (como pasaba con el despacho viejo).
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('ordenes', (t) => {
    t.uuid('pedido_id').references('id').inTable('pedidos').onDelete('RESTRICT');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('ordenes', (t) => t.dropColumn('pedido_id'));
}
