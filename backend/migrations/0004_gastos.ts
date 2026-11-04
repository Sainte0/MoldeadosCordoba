import type { Knex } from 'knex';

// Corte 4: gastos cotidianos (caja chica, impuestos, servicios, empleados…) con foto del comprobante,
// y la caja chica: plata en efectivo de la planta, que se repone y de la que salen gastos.
// Saldo de caja = suma de sus movimientos (como el stock): nada se edita, se agrega lo que compensa.

export async function up(knex: Knex): Promise<void> {
  const ts = (t: Knex.CreateTableBuilder, soft = true) => {
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    if (soft) t.timestamp('deleted_at', { useTz: true });
  };

  // Comprobantes (fotos): en la base, como Centrolab con STORAGE_DRIVER=db. La app las achica antes de subir.
  await knex.schema.createTable('archivos', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('mime').notNullable();
    t.binary('datos').notNullable();
    t.integer('bytes').notNullable();
    t.uuid('usuario_id').notNullable().references('usuarios.id').onDelete('RESTRICT');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('categorias_gasto', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('nombre').notNullable();
    t.boolean('activo').notNullable().defaultTo(true);
    t.integer('orden').notNullable().defaultTo(0);
    ts(t);
  });
  await knex('categorias_gasto').insert(
    ['Caja chica', 'Sueldos y adelantos', 'Impuestos', 'Servicios (luz, gas, agua, internet)', 'Mantenimiento y repuestos', 'Combustible y fletes', 'Otros'].map((nombre, orden) => ({ nombre, orden })),
  );

  await knex.schema.createTable('gastos', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.bigIncrements('numero', { primaryKey: false });
    t.date('fecha').notNullable();
    t.uuid('categoria_id').notNullable().references('categorias_gasto.id').onDelete('RESTRICT');
    t.text('descripcion').notNullable();
    t.bigInteger('monto_centavos').notNullable();
    t.text('medio').notNullable().checkIn(['efectivo', 'transferencia', 'mercado_pago', 'echeq', 'cheque', 'caja_chica'], 'gastos_medio_check');
    t.uuid('banco_id').references('bancos.id').onDelete('RESTRICT');
    t.boolean('con_factura').notNullable().defaultTo(false);
    t.text('nro_factura');
    t.uuid('empleado_id').references('empleados.id').onDelete('RESTRICT'); // sueldos y adelantos
    t.uuid('comprobante_id').references('archivos.id').onDelete('RESTRICT');
    t.text('notas');
    t.uuid('usuario_id').notNullable().references('usuarios.id').onDelete('RESTRICT');
    t.timestamp('anulado_at', { useTz: true });
    t.uuid('anulado_por').references('usuarios.id').onDelete('RESTRICT');
    t.text('motivo_anulacion');
    ts(t, false);
    t.index(['fecha']);
    t.index(['categoria_id', 'fecha']);
  });
  await knex.raw('alter table gastos add constraint gastos_monto_check check (monto_centavos > 0)');

  await knex.schema.createTable('caja_movimientos', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.date('fecha').notNullable();
    t.bigInteger('monto_centavos').notNullable(); // + entra (reposición), − sale (gasto)
    t.text('motivo').notNullable().checkIn(['reposicion', 'gasto', 'anulacion_gasto', 'arqueo'], 'caja_motivo_check');
    t.text('concepto').notNullable();
    t.uuid('gasto_id').references('gastos.id').onDelete('RESTRICT');
    t.uuid('usuario_id').notNullable().references('usuarios.id').onDelete('RESTRICT');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(['fecha']);
  });
  await knex.raw('alter table caja_movimientos add constraint caja_monto_check check (monto_centavos <> 0)');
}

export async function down(knex: Knex): Promise<void> {
  for (const t of ['caja_movimientos', 'gastos', 'categorias_gasto', 'archivos']) await knex.schema.dropTableIfExists(t);
}
