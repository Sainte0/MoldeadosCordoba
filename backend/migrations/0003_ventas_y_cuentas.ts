import type { Knex } from 'knex';

// Corte 3: clientes, precios (lista por código de maple + precio especial por cliente), ventas por palet,
// cobros y pagos con su medio (efectivo, transferencia, Mercado Pago, e-cheq, cheque) y bancos.
// Cuenta corriente = ventas − cobros (cliente) y compras − pagos (proveedor). Se calcula, no se guarda.

export async function up(knex: Knex): Promise<void> {
  const ts = (t: Knex.CreateTableBuilder, soft = true) => {
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    if (soft) t.timestamp('deleted_at', { useTz: true });
  };
  const anulable = (t: Knex.CreateTableBuilder) => {
    t.uuid('usuario_id').notNullable().references('usuarios.id').onDelete('RESTRICT');
    t.timestamp('anulado_at', { useTz: true });
    t.uuid('anulado_por').references('usuarios.id').onDelete('RESTRICT');
    t.text('motivo_anulacion');
    ts(t, false);
  };

  await knex.schema.createTable('bancos', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('nombre').notNullable();
    t.boolean('activo').notNullable().defaultTo(true);
    ts(t);
  });
  await knex('bancos').insert(['Banco Patagonia', 'Santander', 'Galicia', 'Macro', 'Bancor'].map((nombre) => ({ nombre })));

  await knex.schema.createTable('clientes', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('nombre').notNullable();
    t.text('cuit');
    t.text('telefono');
    t.text('email');
    t.text('direccion');
    t.text('vehiculo_habitual').checkIn(['camioneta', 'chasis', 'acoplado', 'camion_termico'], 'clientes_vehiculo_check');
    t.text('notas');
    ts(t);
  });

  // Precio de lista por maple (unidad), en centavos. 0 = sin precio cargado.
  await knex.schema.alterTable('variantes', (t) => {
    t.bigInteger('precio_maple_centavos').notNullable().defaultTo(0);
  });
  await knex.schema.createTable('precios_cliente', (t) => {
    t.uuid('cliente_id').notNullable().references('clientes.id').onDelete('RESTRICT');
    t.uuid('variante_id').notNullable().references('variantes.id').onDelete('RESTRICT');
    t.bigInteger('precio_maple_centavos').notNullable();
    t.primary(['cliente_id', 'variante_id']);
  });
  await knex.raw('alter table precios_cliente add constraint precios_cliente_check check (precio_maple_centavos >= 0)');

  await knex.schema.createTable('ventas', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.bigIncrements('numero', { primaryKey: false });
    t.uuid('cliente_id').notNullable().references('clientes.id').onDelete('RESTRICT');
    t.date('fecha').notNullable();
    t.boolean('con_factura').notNullable();
    t.text('nro_factura');
    t.integer('iva_bp').notNullable().defaultTo(0);
    t.bigInteger('neto_centavos').notNullable();
    t.bigInteger('iva_centavos').notNullable();
    t.bigInteger('total_centavos').notNullable();
    t.text('vehiculo').checkIn(['camioneta', 'chasis', 'acoplado', 'camion_termico'], 'ventas_vehiculo_check');
    t.text('patente');
    t.text('retira'); // quién se llevó los palets (chofer / persona del cliente)
    t.text('notas');
    anulable(t);
    t.index(['cliente_id', 'fecha']);
    t.index(['fecha']);
  });

  await knex.schema.createTable('venta_items', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('venta_id').notNullable().references('ventas.id').onDelete('RESTRICT');
    t.uuid('palet_id').notNullable().references('palets.id').onDelete('RESTRICT');
    t.uuid('variante_id').notNullable().references('variantes.id').onDelete('RESTRICT');
    t.integer('maples').notNullable();
    t.bigInteger('precio_maple_centavos').notNullable();
    t.bigInteger('subtotal_centavos').notNullable();
    t.index(['venta_id']);
    t.index(['palet_id']);
  });

  // El palet sabe en qué venta salió. Se limpia al anular la venta (el palet vuelve a estar disponible).
  await knex.schema.alterTable('palets', (t) => {
    t.uuid('venta_id').references('ventas.id').onDelete('RESTRICT');
  });

  await knex.schema.createTable('movimientos_dinero', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.bigIncrements('numero', { primaryKey: false });
    t.text('tipo').notNullable().checkIn(['cobro', 'pago'], 'dinero_tipo_check'); // cobro = de un cliente, pago = a un proveedor
    t.uuid('cliente_id').references('clientes.id').onDelete('RESTRICT');
    t.uuid('proveedor_id').references('proveedores.id').onDelete('RESTRICT');
    t.date('fecha').notNullable();
    t.bigInteger('monto_centavos').notNullable();
    t.text('medio').notNullable().checkIn(['efectivo', 'transferencia', 'mercado_pago', 'echeq', 'cheque'], 'dinero_medio_check');
    t.uuid('banco_id').references('bancos.id').onDelete('RESTRICT');
    t.text('cheque_numero');
    t.date('cheque_fecha_cobro');
    t.text('referencia'); // nro de operación / comprobante
    t.text('notas');
    anulable(t);
    t.index(['cliente_id', 'fecha']);
    t.index(['proveedor_id', 'fecha']);
  });
  await knex.raw(`alter table movimientos_dinero add constraint dinero_contraparte_check check (
    (tipo = 'cobro' and cliente_id is not null and proveedor_id is null) or (tipo = 'pago' and proveedor_id is not null and cliente_id is null))`);
  await knex.raw(`alter table movimientos_dinero add constraint dinero_medio_datos_check check (
    monto_centavos > 0
    and (medio not in ('echeq', 'cheque') or banco_id is not null)
    and (medio <> 'cheque' or (cheque_numero is not null and cheque_fecha_cobro is not null)))`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('movimientos_dinero');
  await knex.schema.alterTable('palets', (t) => t.dropColumn('venta_id'));
  for (const t of ['venta_items', 'ventas', 'precios_cliente']) await knex.schema.dropTableIfExists(t);
  await knex.schema.alterTable('variantes', (t) => t.dropColumn('precio_maple_centavos'));
  for (const t of ['clientes', 'bancos']) await knex.schema.dropTableIfExists(t);
}
