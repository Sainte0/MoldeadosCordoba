import type { Knex } from 'knex';

// Cheques de terceros: un cheque/e-cheq que paga un cliente queda "en cartera" hasta que se deposita o se le
// endosa a un proveedor (un pago con medio "endoso" que apunta a ese cobro).
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('movimientos_dinero', (t) => {
    t.text('cheque_estado').checkIn(['cartera', 'depositado', 'endosado'], 'dinero_cheque_estado_check');
    t.uuid('endoso_de').references('movimientos_dinero.id').onDelete('RESTRICT'); // en el pago: qué cheque se endosó
  });
  await knex.raw("update movimientos_dinero set cheque_estado = 'cartera' where tipo = 'cobro' and medio in ('cheque', 'echeq') and anulado_at is null");
  await knex.raw('alter table movimientos_dinero drop constraint dinero_medio_check');
  await knex.raw("alter table movimientos_dinero add constraint dinero_medio_check check (medio in ('efectivo', 'transferencia', 'mercado_pago', 'echeq', 'cheque', 'endoso'))");
  await knex.raw("alter table movimientos_dinero add constraint dinero_endoso_check check ((medio = 'endoso') = (endoso_de is not null) and (medio <> 'endoso' or tipo = 'pago'))");
  await knex.raw("create unique index dinero_endoso_unico on movimientos_dinero (endoso_de) where anulado_at is null");
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('drop index if exists dinero_endoso_unico');
  await knex.raw('alter table movimientos_dinero drop constraint dinero_endoso_check');
  await knex.raw("delete from movimientos_dinero where medio = 'endoso'");
  await knex.raw('alter table movimientos_dinero drop constraint dinero_medio_check');
  await knex.raw("alter table movimientos_dinero add constraint dinero_medio_check check (medio in ('efectivo', 'transferencia', 'mercado_pago', 'echeq', 'cheque'))");
  await knex.schema.alterTable('movimientos_dinero', (t) => { t.dropColumn('endoso_de'); t.dropColumn('cheque_estado'); });
}
