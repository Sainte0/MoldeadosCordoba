import type { Knex } from 'knex';

// - Paquetes sueltos: se venden como un "palet suelto" (1×1×N) armado en el momento del despacho. Así reusan el
//   FIFO de lotes, la trazabilidad y el stock de los palets. No llevan etiqueta.
// - Pedidos: lo que un cliente encarga (código + paquetes) y para cuándo. Los despachos se ligan al pedido.
// - Firma: la firma de quien retira, dibujada en el iPad/iPhone, guardada como imagen.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('palets', (t) => {
    t.boolean('suelto').notNullable().defaultTo(false);
  });

  await knex.schema.createTable('pedidos', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.bigIncrements('numero', { primaryKey: false });
    t.uuid('cliente_id').notNullable().references('clientes.id').onDelete('RESTRICT');
    t.date('fecha_entrega');
    t.text('estado').notNullable().defaultTo('abierto').checkIn(['abierto', 'entregado', 'cancelado'], 'pedidos_estado_check');
    t.text('vehiculo').checkIn(['camioneta', 'chasis', 'acoplado', 'camion_termico'], 'pedidos_vehiculo_check');
    t.text('notas');
    t.uuid('usuario_id').notNullable().references('usuarios.id').onDelete('RESTRICT');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(['estado', 'fecha_entrega']);
    t.index(['cliente_id']);
  });
  await knex.schema.createTable('pedido_items', (t) => {
    t.uuid('pedido_id').notNullable().references('pedidos.id').onDelete('CASCADE');
    t.uuid('variante_id').notNullable().references('variantes.id').onDelete('RESTRICT');
    t.integer('paquetes').notNullable();
    t.primary(['pedido_id', 'variante_id']);
  });
  await knex.raw('alter table pedido_items add constraint pedido_items_paquetes_check check (paquetes > 0)');

  await knex.schema.alterTable('ventas', (t) => {
    t.uuid('pedido_id').references('pedidos.id').onDelete('RESTRICT');
    t.uuid('firma_id').references('archivos.id').onDelete('RESTRICT');
    t.timestamp('firmado_at', { useTz: true });
    t.index(['pedido_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('ventas', (t) => { t.dropColumn('pedido_id'); t.dropColumn('firma_id'); t.dropColumn('firmado_at'); });
  await knex.schema.dropTableIfExists('pedido_items');
  await knex.schema.dropTableIfExists('pedidos');
  await knex.schema.alterTable('palets', (t) => t.dropColumn('suelto'));
}
