import type { Knex } from 'knex';

// Ajustes a cómo llevan las finanzas en su planilla (FINANZAS MOLDEADOS 2.0):
// - Calidad en la venta (primera / segunda): la segunda se vende más barata y sale del mismo stock.
// - Egresos: a quién se le paga, gastos "a pagar" con vencimiento (F-931, IVA, facturas pendientes) y monto en
//   dólares de referencia (la tinta importada).
// - Sus categorías de egresos, para que el tablero las muestre igual que la planilla.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('venta_items', (t) => {
    t.text('calidad').notNullable().defaultTo('primera');
  });
  // Ventas anteriores importadas de la planilla: no tienen palet (no descuentan stock, son historia).
  await knex.raw('alter table venta_items alter column palet_id drop not null');
  // El número de remito identifica la venta (/ventas/352): no se repite.
  await knex.raw('create unique index ventas_numero_unico on ventas (numero)');
  await knex.raw(`alter table venta_items add constraint venta_items_calidad check (calidad in ('primera', 'segunda'))`);

  await knex.schema.alterTable('gastos', (t) => {
    t.text('beneficiario');
    t.boolean('a_pagar').notNullable().defaultTo(false);
    t.date('vencimiento');
    t.timestamp('pagado_at', { useTz: true });
    t.uuid('pagado_por').references('usuarios.id').onDelete('RESTRICT');
    t.bigInteger('monto_usd_centavos');
    t.index(['a_pagar', 'vencimiento']);
  });
  await knex.raw('alter table gastos alter column medio drop not null');
  await knex.raw(`alter table gastos add constraint gastos_medio_o_pendiente check (a_pagar or medio is not null)`);

  // Categorías de la planilla que no existan (sin tocar las que ya están).
  const suyas = ['Alquiler', 'Expensas', 'Sueldos y adelantos', 'Impuestos', 'Gastos de estudio', 'EPEC (luz)', 'Aguas Cordobesas', 'Ecogas',
    'Insumos', 'Pallets', 'Mantenimiento y repuestos', 'Combustible y fletes', 'Varios'];
  const hay = new Set((await knex('categorias_gasto').whereNull('deleted_at').select('nombre')).map((c) => String(c.nombre).toLowerCase()));
  const faltan = suyas.filter((n) => !hay.has(n.toLowerCase()));
  if (faltan.length) await knex('categorias_gasto').insert(faltan.map((nombre) => ({ nombre })));
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('gastos', (t) => {
    t.dropIndex(['a_pagar', 'vencimiento']);
    for (const c of ['beneficiario', 'a_pagar', 'vencimiento', 'pagado_at', 'pagado_por', 'monto_usd_centavos']) t.dropColumn(c);
  });
  await knex.raw('drop index if exists ventas_numero_unico');
  await knex.raw('alter table gastos drop constraint if exists gastos_medio_o_pendiente');
  await knex.schema.alterTable('venta_items', (t) => t.dropColumn('calidad'));
}
