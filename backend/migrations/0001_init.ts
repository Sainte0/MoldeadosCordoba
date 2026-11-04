import type { Knex } from 'knex';

// Corte 1: usuarios/permisos, auditoría, proveedores, materia prima con stock por movimientos (libro mayor),
// y compras (el ticket de pesaje es una compra de cartón con bruto/tara).
// Cantidades en milésimas (g / ml) y plata en centavos: siempre bigint, nunca float.

function timestamps(t: Knex.CreateTableBuilder, knex: Knex, soft = true): void {
  t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  if (soft) t.timestamp('deleted_at', { useTz: true });
}

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('usuarios', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('nombre').notNullable();
    t.text('usuario').notNullable();
    t.text('password_hash').notNullable();
    t.text('rol').notNullable().checkIn(['dueno', 'administracion', 'encargado', 'operario'], 'usuarios_rol_check');
    t.boolean('activo').notNullable().defaultTo(true);
    timestamps(t, knex);
  });
  await knex.raw('create unique index usuarios_usuario_uq on usuarios (lower(usuario)) where deleted_at is null');

  // Solo lo que el dueño cambió respecto del default (PERMISOS_DEFAULT en @moldeados/shared).
  await knex.schema.createTable('rol_permisos', (t) => {
    t.text('rol').notNullable();
    t.text('modulo').notNullable();
    t.smallint('nivel').notNullable().checkBetween([0, 3], 'rol_permisos_nivel_check');
    t.primary(['rol', 'modulo']);
  });

  await knex.schema.createTable('auditoria', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('usuario_id').references('usuarios.id').onDelete('RESTRICT');
    t.text('accion').notNullable(); // crear | editar | anular | borrar | ajustar | login
    t.text('entidad').notNullable(); // compra | proveedor | materia_prima | usuario | permiso
    t.uuid('entidad_id');
    t.jsonb('antes');
    t.jsonb('despues');
    t.text('motivo');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(['entidad', 'entidad_id']);
    t.index(['created_at']);
  });

  await knex.schema.createTable('proveedores', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('nombre').notNullable();
    t.text('cuit');
    t.text('telefono');
    t.text('email');
    t.text('direccion');
    t.specificType('tipos', 'text[]').notNullable().defaultTo('{}');
    t.text('notas');
    timestamps(t, knex);
  });

  await knex.schema.createTable('materias_primas', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('nombre').notNullable();
    t.text('tipo').notNullable().checkIn(['carton', 'tinta', 'aglutinante', 'otro'], 'materias_tipo_check');
    t.text('unidad').notNullable().checkIn(['kg', 'l'], 'materias_unidad_check');
    t.text('color');
    t.bigInteger('stock_minimo').notNullable().defaultTo(0);
    t.boolean('activo').notNullable().defaultTo(true);
    timestamps(t, knex);
  });
  await knex.raw('create unique index materias_nombre_uq on materias_primas (lower(nombre)) where deleted_at is null');

  await knex.schema.createTable('compras', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.bigIncrements('numero', { primaryKey: false });
    t.text('tipo').notNullable().checkIn(['pesaje', 'compra'], 'compras_tipo_check');
    t.uuid('proveedor_id').notNullable().references('proveedores.id').onDelete('RESTRICT');
    t.date('fecha').notNullable().defaultTo(knex.raw('current_date'));
    t.boolean('con_factura').notNullable();
    t.text('nro_factura');
    t.integer('iva_bp').notNullable().defaultTo(0);
    t.bigInteger('neto_centavos').notNullable();
    t.bigInteger('iva_centavos').notNullable();
    t.bigInteger('total_centavos').notNullable();
    // Solo pesaje
    t.bigInteger('bruto_g');
    t.bigInteger('tara_g');
    t.text('patente');
    t.text('notas');
    t.uuid('usuario_id').notNullable().references('usuarios.id').onDelete('RESTRICT');
    t.timestamp('anulada_at', { useTz: true });
    t.uuid('anulada_por').references('usuarios.id').onDelete('RESTRICT');
    t.text('motivo_anulacion');
    timestamps(t, knex, false); // una compra nunca se borra: se anula
    t.index(['proveedor_id', 'fecha']);
    t.index(['fecha']);
  });
  await knex.raw('alter table compras add constraint compras_pesaje_check check (tipo <> \'pesaje\' or (bruto_g > tara_g and tara_g >= 0))');

  await knex.schema.createTable('compra_items', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('compra_id').notNullable().references('compras.id').onDelete('RESTRICT');
    t.uuid('materia_prima_id').notNullable().references('materias_primas.id').onDelete('RESTRICT');
    t.bigInteger('cantidad').notNullable();
    t.bigInteger('precio_unitario_centavos').notNullable();
    t.bigInteger('subtotal_centavos').notNullable();
    t.index(['compra_id']);
    t.index(['materia_prima_id']);
  });
  await knex.raw('alter table compra_items add constraint compra_items_cantidad_check check (cantidad > 0 and precio_unitario_centavos >= 0)');

  // Stock = suma de movimientos. Nunca se edita un movimiento: se agrega otro que lo compensa.
  await knex.schema.createTable('movimientos_stock', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('materia_prima_id').notNullable().references('materias_primas.id').onDelete('RESTRICT');
    t.bigInteger('cantidad').notNullable(); // + entra, − sale
    t.text('motivo').notNullable().checkIn(['compra', 'anulacion_compra', 'ajuste', 'consumo'], 'movimientos_motivo_check');
    t.uuid('compra_id').references('compras.id').onDelete('RESTRICT');
    t.text('nota');
    t.uuid('usuario_id').notNullable().references('usuarios.id').onDelete('RESTRICT');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(['materia_prima_id', 'created_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  for (const t of ['movimientos_stock', 'compra_items', 'compras', 'materias_primas', 'proveedores', 'auditoria', 'rol_permisos', 'usuarios']) {
    await knex.schema.dropTableIfExists(t);
  }
}
