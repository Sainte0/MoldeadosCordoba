import type { Knex } from 'knex';
import { calcularCompra, subtotalItem, type CompraInput, type PesajeInput } from '@moldeados/shared';
import { auditar } from '../lib/auditoria.js';
import { ConflictError, NotFoundError, ValidationError } from '../lib/errors.js';

// Alta y anulación de compras. Una compra (o ticket de pesaje) en UNA transacción: compra + ítems +
// entrada de stock + auditoría. Anular no borra nada: agrega movimientos que compensan el stock.

interface Item { materiaPrimaId: string; cantidad: number; precioUnitario: number }

async function validar(trx: Knex.Transaction, proveedorId: string, items: Item[], soloCarton: boolean): Promise<void> {
  const p = await trx('proveedores').where({ id: proveedorId }).whereNull('deleted_at').first('id');
  if (!p) throw new NotFoundError('No encontramos ese proveedor');
  const ids = [...new Set(items.map((i) => i.materiaPrimaId))];
  const mps = await trx('materias_primas').whereIn('id', ids).whereNull('deleted_at').where({ activo: true }).select('id', 'tipo');
  if (mps.length !== ids.length) throw new ValidationError('Hay un producto que no existe o está desactivado');
  if (soloCarton && mps.some((m) => m.tipo !== 'carton')) throw new ValidationError('La entrada de cartón es solo para cartón');
}

async function guardar(
  trx: Knex.Transaction,
  usuarioId: string,
  base: Record<string, unknown> & { proveedor_id: string; iva_bp: number },
  items: Item[],
): Promise<{ id: string; numero: number }> {
  const t = calcularCompra(items, base.iva_bp);
  const [compra] = await trx('compras')
    .insert({ ...base, neto_centavos: t.neto, iva_centavos: t.iva, total_centavos: t.total, usuario_id: usuarioId })
    .returning(['id', 'numero']);
  await trx('compra_items').insert(
    items.map((i) => ({ compra_id: compra.id, materia_prima_id: i.materiaPrimaId, cantidad: i.cantidad, precio_unitario_centavos: i.precioUnitario, subtotal_centavos: subtotalItem(i.cantidad, i.precioUnitario) })),
  );
  await trx('movimientos_stock').insert(
    items.map((i) => ({ materia_prima_id: i.materiaPrimaId, cantidad: i.cantidad, motivo: 'compra', compra_id: compra.id, usuario_id: usuarioId })),
  );
  await auditar(trx, { usuarioId, accion: 'crear', entidad: 'compra', entidadId: compra.id, despues: { ...base, items, totales: t } });
  return compra;
}

function datosFactura(i: { conFactura: boolean; nroFactura: string | null; ivaBp: number }) {
  // Sin factura no hay IVA discriminado: se ignora lo que venga.
  return { con_factura: i.conFactura, nro_factura: i.conFactura ? i.nroFactura : null, iva_bp: i.conFactura ? i.ivaBp : 0 };
}

export async function crearPesaje(db: Knex, usuarioId: string, i: PesajeInput) {
  const items = [{ materiaPrimaId: i.materiaPrimaId, cantidad: i.brutoG - i.taraG, precioUnitario: i.precioPorKg }];
  return db.transaction(async (trx) => {
    await validar(trx, i.proveedorId, items, true);
    return guardar(trx, usuarioId, { tipo: 'pesaje', proveedor_id: i.proveedorId, fecha: i.fecha, ...datosFactura(i), bruto_g: i.brutoG, tara_g: i.taraG, patente: i.patente, notas: i.notas }, items);
  });
}

export async function crearCompra(db: Knex, usuarioId: string, i: CompraInput) {
  return db.transaction(async (trx) => {
    await validar(trx, i.proveedorId, i.items, false);
    return guardar(trx, usuarioId, { tipo: 'compra', proveedor_id: i.proveedorId, fecha: i.fecha, ...datosFactura(i), notas: i.notas }, i.items);
  });
}

export async function anularCompra(db: Knex, usuarioId: string, compraId: string, motivo: string): Promise<void> {
  await db.transaction(async (trx) => {
    const c = await trx('compras').where({ id: compraId }).forUpdate().first('id', 'anulada_at');
    if (!c) throw new NotFoundError('No encontramos esa compra');
    if (c.anulada_at) throw new ConflictError('Esta compra ya estaba anulada');
    await trx('compras').where({ id: c.id }).update({ anulada_at: trx.fn.now(), anulada_por: usuarioId, motivo_anulacion: motivo, updated_at: trx.fn.now() });
    const items = await trx('compra_items').where({ compra_id: c.id }).select('materia_prima_id', 'cantidad');
    await trx('movimientos_stock').insert(
      items.map((it) => ({ materia_prima_id: it.materia_prima_id, cantidad: -it.cantidad, motivo: 'anulacion_compra', compra_id: c.id, nota: motivo, usuario_id: usuarioId })),
    );
    await auditar(trx, { usuarioId, accion: 'anular', entidad: 'compra', entidadId: c.id, motivo });
  });
}
