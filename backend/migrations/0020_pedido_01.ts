import type { Knex } from 'knex';

// Pedido de cambios N° 01 (24/11/2026):
// 1) Cliente con condición de pago (Cuenta 1, Cuenta 2 o Mixta con % a Cuenta 1) y base de choferes.
// 2) Rol Gerente (emite órdenes, cierra cortas, anula pallets).
// 3) Orden de venta: renglones (maple + alto + cantidad de pallets) y los pallets escaneados al subir al camión.
//    Al cerrar se registran las ventas (Cuenta 1 = con factura, Cuenta 2 = sin factura; Mixta reparte).
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('clientes', (t) => {
    t.text('condicion_pago').notNullable().defaultTo('cuenta1').checkIn(['cuenta1', 'cuenta2', 'mixta'], 'clientes_condicion_check');
    t.smallint('porcentaje_cuenta1'); // solo Mixta: cuánto va a Cuenta 1 (1..99)
  });

  await knex.raw('alter table usuarios drop constraint usuarios_rol_check');
  await knex.raw("alter table usuarios add constraint usuarios_rol_check check (rol in ('dueno','gerente','administracion','encargado','operario'))");

  await knex.schema.createTable('choferes', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('nombre').notNullable();
    t.text('apellido').notNullable();
    t.text('dni');
    t.text('telefono');
    t.text('patente');
    t.text('vehiculo').checkIn(['camioneta', 'chasis', 'acoplado', 'camion_termico'], 'choferes_vehiculo_check');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('deleted_at', { useTz: true });
  });
  await knex.schema.createTable('chofer_clientes', (t) => {
    t.uuid('chofer_id').notNullable().references('choferes.id').onDelete('CASCADE');
    t.uuid('cliente_id').notNullable().references('clientes.id').onDelete('RESTRICT');
    t.primary(['chofer_id', 'cliente_id']);
    t.index(['cliente_id']);
  });

  await knex.schema.createTable('ordenes', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.bigIncrements('numero', { primaryKey: false });
    t.uuid('cliente_id').notNullable().references('clientes.id').onDelete('RESTRICT');
    t.uuid('chofer_id').references('choferes.id').onDelete('RESTRICT');
    t.date('fecha').notNullable();
    t.text('condicion_pago').notNullable().checkIn(['cuenta1', 'cuenta2', 'mixta'], 'ordenes_condicion_check');
    t.smallint('porcentaje_cuenta1');
    t.text('estado').notNullable().defaultTo('abierta').checkIn(['abierta', 'cerrada', 'cancelada'], 'ordenes_estado_check');
    t.text('notas');
    t.uuid('usuario_id').notNullable().references('usuarios.id').onDelete('RESTRICT');
    t.timestamp('cerrada_at', { useTz: true });
    t.uuid('cerrada_por').references('usuarios.id').onDelete('RESTRICT');
    t.text('motivo'); // por qué se cerró corta o se canceló
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(['estado']);
    t.index(['cliente_id']);
  });
  await knex.schema.createTable('orden_items', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('orden_id').notNullable().references('ordenes.id').onDelete('RESTRICT');
    t.uuid('variante_id').notNullable().references('variantes.id').onDelete('RESTRICT');
    t.integer('alto').notNullable();
    t.integer('cantidad').notNullable();
    t.bigInteger('precio_maple_centavos').notNullable();
    t.index(['orden_id']);
  });
  await knex.raw('alter table orden_items add constraint orden_items_check check (cantidad > 0 and alto > 0 and precio_maple_centavos >= 0)');
  await knex.schema.createTable('orden_palets', (t) => {
    t.uuid('orden_id').notNullable().references('ordenes.id').onDelete('RESTRICT');
    t.uuid('item_id').notNullable().references('orden_items.id').onDelete('RESTRICT');
    t.uuid('palet_id').notNullable().references('palets.id').onDelete('RESTRICT');
    t.uuid('usuario_id').notNullable().references('usuarios.id').onDelete('RESTRICT');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.boolean('vigente').notNullable().defaultTo(true); // false si la orden se canceló: el pallet vuelve al stock
    t.index(['orden_id']);
  });
  // Un pallet está en una sola orden vigente a la vez.
  await knex.raw('create unique index orden_palets_vigente_uq on orden_palets (palet_id) where vigente');

  await knex.schema.alterTable('ventas', (t) => {
    t.uuid('orden_id').references('ordenes.id').onDelete('RESTRICT');
    t.index(['orden_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('ventas', (t) => t.dropColumn('orden_id'));
  for (const t of ['orden_palets', 'orden_items', 'ordenes', 'chofer_clientes', 'choferes']) await knex.schema.dropTableIfExists(t);
  await knex.raw('alter table usuarios drop constraint usuarios_rol_check');
  await knex.raw("alter table usuarios add constraint usuarios_rol_check check (rol in ('dueno','administracion','encargado','operario'))");
  await knex.schema.alterTable('clientes', (t) => { t.dropColumn('condicion_pago'); t.dropColumn('porcentaje_cuenta1'); });
}
