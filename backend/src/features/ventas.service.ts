import type { Knex } from 'knex';
import { calcularVenta, type MovimientoDineroInput, type VentaInput } from '@moldeados/shared';
import { auditar } from '../lib/auditoria.js';
import { ConflictError, NotFoundError, ValidationError } from '../lib/errors.js';

// Ventas por palet y movimientos de dinero. Cada operación en una transacción con su auditoría.

/** Precio por maple para un cliente: el especial si tiene, si no el de lista. */
export async function preciosParaCliente(db: Knex, clienteId: string | null): Promise<Map<string, number>> {
  const lista = await db('variantes').whereNull('deleted_at').select('id', 'precio_maple_centavos as p');
  const m = new Map(lista.map((v) => [v.id as string, Number(v.p)]));
  if (clienteId) {
    const esp = await db('precios_cliente').where({ cliente_id: clienteId }).select('variante_id', 'precio_maple_centavos as p');
    for (const e of esp) m.set(e.variante_id, Number(e.p));
  }
  return m;
}

export async function crearVenta(db: Knex, usuarioId: string, i: VentaInput): Promise<{ id: string; numero: number }> {
  return db.transaction(async (trx) => {
    const c = await trx('clientes').where({ id: i.clienteId }).whereNull('deleted_at').first('id');
    if (!c) throw new NotFoundError('No encontramos ese cliente');
    const ids = [...new Set(i.palets)];
    // Bloquea los palets: dos ventas a la vez no pueden llevarse el mismo.
    const palets = await trx('palets as p').join('variantes as v', 'v.id', 'p.variante_id').whereIn('p.id', ids).forUpdate('p')
      .select('p.id', 'p.numero', 'p.variante_id', 'p.paquetes', 'p.anulado_at', 'p.venta_id', 'v.maples_por_paquete', 'v.codigo');
    if (palets.length !== ids.length) throw new ValidationError('Hay un palet que no existe');
    const ocupado = palets.find((p) => p.anulado_at || p.venta_id);
    if (ocupado) throw new ConflictError(`El palet ${String(ocupado.numero).padStart(6, '0')} ya no está disponible (${ocupado.venta_id ? 'ya se vendió' : 'se desarmó'}).`);

    const precios = await preciosParaCliente(trx, i.clienteId);
    for (const p of i.precios) precios.set(p.varianteId, p.precioMaple);
    const items = palets.map((p) => {
      const precio = precios.get(p.variante_id) ?? 0;
      if (precio <= 0) throw new ValidationError(`Falta el precio del ${p.codigo}. Cargalo en la venta o en Precios.`);
      return { palet: p, maples: p.paquetes * p.maples_por_paquete, precioMaple: precio };
    });
    const ivaBp = i.conFactura ? i.ivaBp : 0;
    const t = calcularVenta(items, ivaBp);

    const [venta] = await trx('ventas').insert({
      cliente_id: i.clienteId, fecha: i.fecha, con_factura: i.conFactura, nro_factura: i.conFactura ? i.nroFactura : null, iva_bp: ivaBp,
      neto_centavos: t.neto, iva_centavos: t.iva, total_centavos: t.total, vehiculo: i.vehiculo, patente: i.patente, retira: i.retira, notas: i.notas, usuario_id: usuarioId,
    }).returning(['id', 'numero']);
    await trx('venta_items').insert(items.map((it) => ({
      venta_id: venta.id, palet_id: it.palet.id, variante_id: it.palet.variante_id, maples: it.maples, precio_maple_centavos: it.precioMaple, subtotal_centavos: it.maples * it.precioMaple,
    })));
    await trx('palets').whereIn('id', ids).update({ venta_id: venta.id, updated_at: trx.fn.now() });
    await auditar(trx, { usuarioId, accion: 'crear', entidad: 'venta', entidadId: venta.id, despues: { ...i, totales: t } });
    return venta;
  });
}

export async function anularVenta(db: Knex, usuarioId: string, ventaId: string, motivo: string): Promise<void> {
  await db.transaction(async (trx) => {
    const v = await trx('ventas').where({ id: ventaId }).forUpdate().first('id', 'anulado_at');
    if (!v) throw new NotFoundError('No encontramos esa venta');
    if (v.anulado_at) throw new ConflictError('Esta venta ya estaba anulada');
    await trx('ventas').where({ id: v.id }).update({ anulado_at: trx.fn.now(), anulado_por: usuarioId, motivo_anulacion: motivo, updated_at: trx.fn.now() });
    await trx('palets').where({ venta_id: v.id }).update({ venta_id: null, updated_at: trx.fn.now() }); // vuelven a estar disponibles
    await auditar(trx, { usuarioId, accion: 'anular', entidad: 'venta', entidadId: v.id, motivo });
  });
}

export async function crearMovimiento(db: Knex, usuarioId: string, i: MovimientoDineroInput): Promise<{ id: string; numero: number }> {
  return db.transaction(async (trx) => {
    if (i.tipo === 'cobro' && !(await trx('clientes').where({ id: i.clienteId! }).whereNull('deleted_at').first('id'))) throw new NotFoundError('No encontramos ese cliente');
    if (i.tipo === 'pago' && !(await trx('proveedores').where({ id: i.proveedorId! }).whereNull('deleted_at').first('id'))) throw new NotFoundError('No encontramos ese proveedor');
    const conBanco = i.medio === 'echeq' || i.medio === 'cheque' || (i.medio === 'transferencia' && i.bancoId);
    if (conBanco && i.bancoId && !(await trx('bancos').where({ id: i.bancoId }).whereNull('deleted_at').first('id'))) throw new ValidationError('Ese banco no existe');
    const [m] = await trx('movimientos_dinero').insert({
      tipo: i.tipo, cliente_id: i.tipo === 'cobro' ? i.clienteId : null, proveedor_id: i.tipo === 'pago' ? i.proveedorId : null, fecha: i.fecha,
      monto_centavos: i.monto, medio: i.medio, banco_id: conBanco ? i.bancoId : null,
      cheque_numero: i.medio === 'cheque' || i.medio === 'echeq' ? i.chequeNumero : null, cheque_fecha_cobro: i.medio === 'cheque' || i.medio === 'echeq' ? i.chequeFechaCobro : null,
      referencia: i.referencia, notas: i.notas, usuario_id: usuarioId,
    }).returning(['id', 'numero']);
    await auditar(trx, { usuarioId, accion: 'crear', entidad: i.tipo, entidadId: m.id, despues: i });
    return m;
  });
}

export async function anularMovimiento(db: Knex, usuarioId: string, id: string, motivo: string): Promise<void> {
  await db.transaction(async (trx) => {
    const m = await trx('movimientos_dinero').where({ id }).forUpdate().first('id', 'tipo', 'anulado_at');
    if (!m) throw new NotFoundError('No encontramos ese movimiento');
    if (m.anulado_at) throw new ConflictError('Ya estaba anulado');
    await trx('movimientos_dinero').where({ id }).update({ anulado_at: trx.fn.now(), anulado_por: usuarioId, motivo_anulacion: motivo, updated_at: trx.fn.now() });
    await auditar(trx, { usuarioId, accion: 'anular', entidad: m.tipo, entidadId: id, motivo });
  });
}

/**
 * Saldos de todos los clientes o proveedores. Positivo = nos debe (cliente) / le debemos (proveedor).
 * Se separa en blanco/negro según la factura de la venta o compra; los pagos no se separan.
 */
export async function saldos(db: Knex, de: 'cliente' | 'proveedor') {
  if (de === 'cliente') {
    return db('clientes as c').whereNull('c.deleted_at').select('c.id', 'c.nombre',
      db.raw('coalesce((select sum(v.total_centavos) from ventas v where v.cliente_id = c.id and v.anulado_at is null), 0)::bigint as debe'),
      db.raw(`coalesce((select sum(m.monto_centavos) from movimientos_dinero m where m.cliente_id = c.id and m.anulado_at is null), 0)::bigint as haber`),
      db.raw('(select max(v.fecha) from ventas v where v.cliente_id = c.id and v.anulado_at is null) as "ultimoMovimiento"'))
      .orderBy('c.nombre');
  }
  return db('proveedores as p').whereNull('p.deleted_at').select('p.id', 'p.nombre',
    db.raw('coalesce((select sum(c.total_centavos) from compras c where c.proveedor_id = p.id and c.anulada_at is null), 0)::bigint as debe'),
    db.raw(`coalesce((select sum(m.monto_centavos) from movimientos_dinero m where m.proveedor_id = p.id and m.anulado_at is null), 0)::bigint as haber`),
    db.raw('(select max(c.fecha) from compras c where c.proveedor_id = p.id and c.anulada_at is null) as "ultimoMovimiento"'))
    .orderBy('p.nombre');
}

/** Movimientos de una cuenta corriente, del más viejo al más nuevo, con saldo acumulado. */
export async function cuentaCorriente(db: Knex, de: 'cliente' | 'proveedor', id: string) {
  const comprobantes = de === 'cliente'
    ? await db('ventas').where({ cliente_id: id }).select('id', 'numero', 'fecha', 'created_at', 'total_centavos as monto', 'con_factura as conFactura', 'anulado_at as anuladoAt', db.raw("'venta' as tipo"))
    : await db('compras').where({ proveedor_id: id }).select('id', 'numero', 'fecha', 'created_at', 'total_centavos as monto', 'con_factura as conFactura', 'anulada_at as anuladoAt', db.raw('tipo'));
  const dinero = await db('movimientos_dinero as m').leftJoin('bancos as b', 'b.id', 'm.banco_id').where(de === 'cliente' ? { 'm.cliente_id': id } : { 'm.proveedor_id': id })
    .select('m.id', 'm.numero', 'm.fecha', 'm.created_at', 'm.monto_centavos as monto', 'm.medio', 'b.nombre as banco', 'm.cheque_numero as chequeNumero',
      'm.cheque_fecha_cobro as chequeFechaCobro', 'm.referencia', 'm.anulado_at as anuladoAt', 'm.tipo');
  const todos = [
    ...comprobantes.map((c) => ({ ...c, signo: 1 as const })),
    ...dinero.map((d) => ({ ...d, signo: -1 as const })),
  ].sort((a, b) => (a.fecha === b.fecha ? +new Date(a.created_at) - +new Date(b.created_at) : a.fecha < b.fecha ? -1 : 1));
  let saldo = 0;
  return todos.map(({ created_at: _, ...m }) => {
    if (!m.anuladoAt) saldo += m.signo * Number(m.monto);
    return { ...m, saldo };
  });
}
