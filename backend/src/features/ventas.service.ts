import type { Knex } from 'knex';
import { calcularVenta, type MovimientoDineroInput, type PedidoInput, type VentaInput } from '@moldeados/shared';
import { armarPalet } from './produccion.service.js';
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
    const c = await trx('clientes').where({ id: i.clienteId }).whereNull('deleted_at').first('id', 'nombre');
    if (!c) throw new NotFoundError('No encontramos ese cliente');
    if (i.pedidoId) {
      const p = await trx('pedidos').where({ id: i.pedidoId }).forUpdate().first('cliente_id', 'estado');
      if (!p || p.cliente_id !== i.clienteId) throw new ValidationError('Ese pedido no es de este cliente');
      if (p.estado !== 'abierto') throw new ConflictError('Ese pedido ya está entregado o cancelado');
    }
    // Paquetes sueltos: un palet 1×1×N armado ahora (FIFO de producción, misma trazabilidad), sin etiqueta.
    const sueltos = [];
    for (const s of i.sueltos) {
      sueltos.push((await armarPalet(trx, usuarioId, { varianteId: s.varianteId, ancho: 1, largo: 1, alto: s.paquetes, vehiculo: i.vehiculo, destino: c.nombre, notas: null }, true)).id);
    }
    const ids = [...new Set([...i.palets, ...sueltos])];
    // Bloquea los palets: dos ventas a la vez no pueden llevarse el mismo.
    const palets = await trx('palets as p').join('variantes as v', 'v.id', 'p.variante_id').whereIn('p.id', ids).forUpdate('p')
      .select('p.id', 'p.numero', 'p.variante_id', 'p.paquetes', 'p.anulado_at', 'p.venta_id', 'v.maples_por_paquete', 'v.codigo');
    if (palets.length !== ids.length) throw new ValidationError('Hay un palet que no existe');
    const ocupado = palets.find((p) => p.anulado_at || p.venta_id);
    if (ocupado) throw new ConflictError(`El palet ${String(ocupado.numero).padStart(6, '0')} ya no está disponible (${ocupado.venta_id ? 'ya se vendió' : 'se desarmó'}).`);

    const precios = await preciosParaCliente(trx, i.clienteId);
    const dados = new Map(i.precios.map((p) => [p.varianteId, p.precioMaple]));
    for (const [k, v] of dados) precios.set(k, v);
    const segunda = new Set(i.segunda);
    const items = palets.map((p) => {
      const esSegunda = segunda.has(p.variante_id);
      // La segunda no tiene precio de lista: se escribe en la venta.
      const precio = esSegunda ? dados.get(p.variante_id) ?? 0 : precios.get(p.variante_id) ?? 0;
      if (precio <= 0) throw new ValidationError(`Falta el precio${esSegunda ? ' de segunda' : ''} del ${p.codigo}. Cargalo en la venta${esSegunda ? '' : ' o en Precios'}.`);
      return { palet: p, maples: p.paquetes * p.maples_por_paquete, precioMaple: precio, calidad: esSegunda ? 'segunda' : 'primera' };
    });
    const ivaBp = i.conFactura ? i.ivaBp : 0;
    const t = calcularVenta(items, ivaBp);

    // Firma de quien retira (dibujada en la pantalla): se guarda como imagen.
    let firmaId: string | null = null;
    if (i.firma) firmaId = await guardarFirma(trx, usuarioId, i.firma);
    const [venta] = await trx('ventas').insert({
      pedido_id: i.pedidoId, firma_id: firmaId, firmado_at: firmaId ? trx.fn.now() : null,
      cliente_id: i.clienteId, fecha: i.fecha, con_factura: i.conFactura, nro_factura: i.conFactura ? i.nroFactura : null, iva_bp: ivaBp,
      neto_centavos: t.neto, iva_centavos: t.iva, total_centavos: t.total, vehiculo: i.vehiculo, patente: i.patente, retira: i.retira, notas: i.notas, usuario_id: usuarioId,
    }).returning(['id', 'numero']);
    await trx('venta_items').insert(items.map((it) => ({
      venta_id: venta.id, palet_id: it.palet.id, variante_id: it.palet.variante_id, maples: it.maples, precio_maple_centavos: it.precioMaple, subtotal_centavos: it.maples * it.precioMaple, calidad: it.calidad,
    })));
    // Lo que pagó en el momento: un cobro por medio, a la cuenta del cliente (como "Monto pagado" de la planilla).
    const pagado = i.pagos.reduce((a, p) => a + p.monto, 0);
    if (pagado > t.total) throw new ValidationError('Lo que pagó es más que el total de la venta. Si dejó plata a cuenta, registralo como cobro aparte.');
    for (const p of i.pagos) {
      await trx('movimientos_dinero').insert({ tipo: 'cobro', cliente_id: i.clienteId, fecha: i.fecha, monto_centavos: p.monto, medio: p.medio, referencia: `Remito ${String(venta.numero).padStart(6, '0')}`, usuario_id: usuarioId });
    }
    await trx('palets').whereIn('id', ids).update({ venta_id: venta.id, updated_at: trx.fn.now() });
    if (i.pedidoId) await actualizarEstadoPedido(trx, i.pedidoId);
    await auditar(trx, { usuarioId, accion: 'crear', entidad: 'venta', entidadId: venta.id, despues: { ...i, firma: i.firma ? '(firma)' : null, totales: t } });
    return venta;
  });
}

export async function anularVenta(db: Knex, usuarioId: string, ventaId: string, motivo: string): Promise<void> {
  await db.transaction(async (trx) => {
    const v = await trx('ventas').where({ id: ventaId }).forUpdate().first('id', 'anulado_at', 'pedido_id');
    if (!v) throw new NotFoundError('No encontramos esa venta');
    if (v.anulado_at) throw new ConflictError('Esta venta ya estaba anulada');
    await trx('ventas').where({ id: v.id }).update({ anulado_at: trx.fn.now(), anulado_por: usuarioId, motivo_anulacion: motivo, updated_at: trx.fn.now() });
    // Los paquetes sueltos vuelven a estar sueltos (su palet 1×1×N se deshace); los palets, disponibles para otro despacho.
    await trx('palets').where({ venta_id: v.id, suelto: true }).update({ anulado_at: trx.fn.now(), anulado_por: usuarioId, motivo_anulacion: `Venta anulada: ${motivo}`, venta_id: null, updated_at: trx.fn.now() });
    await trx('palets').where({ venta_id: v.id }).update({ venta_id: null, updated_at: trx.fn.now() });
    if (v.pedido_id) await actualizarEstadoPedido(trx, v.pedido_id);
    await auditar(trx, { usuarioId, accion: 'anular', entidad: 'venta', entidadId: v.id, motivo });
  });
}

export async function crearMovimiento(db: Knex, usuarioId: string, i: MovimientoDineroInput): Promise<{ id: string; numero: number }> {
  if (i.medio === 'endoso') return endosar(db, usuarioId, i);
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
      // Un cheque que recibimos queda en cartera hasta depositarlo o endosarlo.
      cheque_estado: i.tipo === 'cobro' && (i.medio === 'cheque' || i.medio === 'echeq') ? 'cartera' : null,
    }).returning(['id', 'numero']);
    await auditar(trx, { usuarioId, accion: 'crear', entidad: i.tipo, entidadId: m.id, despues: i });
    return m;
  });
}

/**
 * Pago a un proveedor entregándole un cheque de terceros que está en cartera. Monto = el del cheque (no se
 * parte). El cheque pasa a "endosado" y queda ligado al pago.
 */
async function endosar(db: Knex, usuarioId: string, i: MovimientoDineroInput): Promise<{ id: string; numero: number }> {
  return db.transaction(async (trx) => {
    if (!(await trx('proveedores').where({ id: i.proveedorId! }).whereNull('deleted_at').first('id'))) throw new NotFoundError('No encontramos ese proveedor');
    const ch = await trx('movimientos_dinero').where({ id: i.endosoDe! }).forUpdate()
      .first('id', 'tipo', 'medio', 'cheque_estado', 'anulado_at', 'monto_centavos', 'banco_id', 'cheque_numero', 'cheque_fecha_cobro');
    if (!ch || ch.tipo !== 'cobro' || !['cheque', 'echeq'].includes(ch.medio)) throw new ValidationError('Ese no es un cheque recibido de un cliente');
    if (ch.anulado_at || ch.cheque_estado !== 'cartera') throw new ConflictError('Ese cheque ya no está en cartera (se depositó, se endosó o se anuló)');
    const [m] = await trx('movimientos_dinero').insert({
      tipo: 'pago', proveedor_id: i.proveedorId, fecha: i.fecha, monto_centavos: ch.monto_centavos, medio: 'endoso', endoso_de: ch.id,
      banco_id: ch.banco_id, cheque_numero: ch.cheque_numero, cheque_fecha_cobro: ch.cheque_fecha_cobro, referencia: i.referencia, notas: i.notas, usuario_id: usuarioId,
    }).returning(['id', 'numero']);
    await trx('movimientos_dinero').where({ id: ch.id }).update({ cheque_estado: 'endosado', updated_at: trx.fn.now() });
    await auditar(trx, { usuarioId, accion: 'crear', entidad: 'pago', entidadId: m.id, despues: { ...i, monto: Number(ch.monto_centavos) }, motivo: 'Pago con cheque de terceros' });
    return m;
  });
}

/** Cheque en cartera → depositado (o al revés, si se cargó por error). */
export async function cambiarEstadoCheque(db: Knex, usuarioId: string, id: string, estado: 'cartera' | 'depositado'): Promise<void> {
  await db.transaction(async (trx) => {
    const ch = await trx('movimientos_dinero').where({ id }).forUpdate().first('id', 'cheque_estado', 'anulado_at');
    if (!ch || !ch.cheque_estado || ch.anulado_at) throw new NotFoundError('No encontramos ese cheque en cartera');
    if (ch.cheque_estado === 'endosado') throw new ConflictError('Ese cheque ya se le entregó a un proveedor');
    await trx('movimientos_dinero').where({ id }).update({ cheque_estado: estado, updated_at: trx.fn.now() });
    await auditar(trx, { usuarioId, accion: 'editar', entidad: 'cobro', entidadId: id, antes: { cheque: ch.cheque_estado }, despues: { cheque: estado } });
  });
}

export async function anularMovimiento(db: Knex, usuarioId: string, id: string, motivo: string): Promise<void> {
  await db.transaction(async (trx) => {
    const m = await trx('movimientos_dinero').where({ id }).forUpdate().first('id', 'tipo', 'anulado_at', 'cheque_estado', 'endoso_de');
    if (!m) throw new NotFoundError('No encontramos ese movimiento');
    if (m.anulado_at) throw new ConflictError('Ya estaba anulado');
    if (m.cheque_estado === 'endosado') {
      const pago = await trx('movimientos_dinero as p').join('proveedores as pr', 'pr.id', 'p.proveedor_id').where('p.endoso_de', id).whereNull('p.anulado_at').first('p.numero', 'pr.nombre');
      throw new ConflictError(`Este cheque se le entregó a ${pago?.nombre ?? 'un proveedor'} (pago ${String(pago?.numero ?? '').padStart(6, '0')}). Si volvió rechazado, anulá primero ese pago.`);
    }
    // Anular el pago con un cheque de terceros: el cheque vuelve a la cartera.
    if (m.endoso_de) await trx('movimientos_dinero').where({ id: m.endoso_de }).update({ cheque_estado: 'cartera', updated_at: trx.fn.now() });
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
      db.raw(`(coalesce((select sum(v.total_centavos) from ventas v where v.cliente_id = c.id and v.anulado_at is null), 0)
        + coalesce((select sum(s.monto_centavos) from saldos_iniciales s where s.cliente_id = c.id and s.anulado_at is null), 0))::bigint as debe`),
      db.raw(`coalesce((select sum(m.monto_centavos) from movimientos_dinero m where m.cliente_id = c.id and m.anulado_at is null), 0)::bigint as haber`),
      db.raw('(select max(v.fecha) from ventas v where v.cliente_id = c.id and v.anulado_at is null) as "ultimoMovimiento"'))
      .orderBy('c.nombre');
  }
  return db('proveedores as p').whereNull('p.deleted_at').select('p.id', 'p.nombre',
    db.raw(`(coalesce((select sum(c.total_centavos) from compras c where c.proveedor_id = p.id and c.anulada_at is null), 0)
      + coalesce((select sum(s.monto_centavos) from saldos_iniciales s where s.proveedor_id = p.id and s.anulado_at is null), 0))::bigint as debe`),
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
  const iniciales = await db('saldos_iniciales').where(de === 'cliente' ? { cliente_id: id } : { proveedor_id: id })
    .select('id', db.raw('0 as numero'), 'fecha', 'created_at', 'monto_centavos as monto', db.raw('null as "conFactura"'), 'anulado_at as anuladoAt', db.raw("'saldo_inicial' as tipo"), 'nota as referencia');
  const todos = [
    ...iniciales.map((c) => ({ ...c, signo: 1 as const })),
    ...comprobantes.map((c) => ({ ...c, signo: 1 as const })),
    ...dinero.map((d) => ({ ...d, signo: -1 as const })),
  ].sort((a, b) => (a.fecha === b.fecha ? +new Date(a.created_at) - +new Date(b.created_at) : a.fecha < b.fecha ? -1 : 1));
  let saldo = 0;
  return todos.map(({ created_at: _, ...m }) => {
    if (!m.anuladoAt) saldo += m.signo * Number(m.monto);
    return { ...m, saldo };
  });
}

/** Guarda la firma (PNG en base64) como archivo y devuelve su id. */
export async function guardarFirma(trx: Knex.Transaction, usuarioId: string, base64: string): Promise<string> {
  const datos = Buffer.from(base64, 'base64');
  // Un PNG empieza con 89 50 4E 47: lo que no lo sea, no se guarda.
  if (datos.length < 100 || datos.subarray(0, 4).toString('hex') !== '89504e47') throw new ValidationError('La firma no se pudo leer. Probá firmar de nuevo.');
  const [a] = await trx('archivos').insert({ mime: 'image/png', datos, bytes: datos.length, usuario_id: usuarioId }).returning('id');
  return a.id;
}

/** Paquetes despachados por código para un pedido (ventas vigentes ligadas a él). */
export async function despachadoDelPedido(q: Knex | Knex.Transaction, pedidoId: string): Promise<Map<string, number>> {
  const filas = await q('palets as pa').join('ventas as v', 'v.id', 'pa.venta_id').where('v.pedido_id', pedidoId).whereNull('v.anulado_at')
    .groupBy('pa.variante_id').select('pa.variante_id', q.raw('sum(pa.paquetes)::int as paquetes'));
  return new Map(filas.map((f: { variante_id: string; paquetes: number }) => [f.variante_id, f.paquetes]));
}

/** Un pedido se da por entregado solo cuando se despachó todo lo pedido; si se anula un despacho, se reabre. */
export async function actualizarEstadoPedido(trx: Knex.Transaction, pedidoId: string): Promise<void> {
  const p = await trx('pedidos').where({ id: pedidoId }).first('estado');
  if (!p || p.estado === 'cancelado') return;
  const items = await trx('pedido_items').where({ pedido_id: pedidoId }).select('variante_id', 'paquetes');
  const hecho = await despachadoDelPedido(trx, pedidoId);
  const completo = items.every((i) => (hecho.get(i.variante_id) ?? 0) >= i.paquetes);
  const estado = completo ? 'entregado' : 'abierto';
  if (estado !== p.estado) await trx('pedidos').where({ id: pedidoId }).update({ estado, updated_at: trx.fn.now() });
}

export async function guardarPedido(db: Knex, usuarioId: string, i: PedidoInput, id?: string): Promise<{ id: string; numero: number }> {
  return db.transaction(async (trx) => {
    if (!(await trx('clientes').where({ id: i.clienteId }).whereNull('deleted_at').first('id'))) throw new NotFoundError('No encontramos ese cliente');
    const variantes = await trx('variantes').whereIn('id', i.items.map((x) => x.varianteId)).whereNull('deleted_at').count<{ c: number }>('id as c').first();
    if (Number(variantes?.c) !== i.items.length) throw new ValidationError('Hay un maple que no existe');
    let pedido: { id: string; numero: number };
    if (id) {
      const antes = await trx('pedidos').where({ id }).forUpdate().first('id', 'numero', 'estado');
      if (!antes) throw new NotFoundError('No encontramos ese pedido');
      if (antes.estado === 'cancelado') throw new ConflictError('Ese pedido está cancelado');
      await trx('pedidos').where({ id }).update({ cliente_id: i.clienteId, fecha_entrega: i.fechaEntrega, vehiculo: i.vehiculo, notas: i.notas, updated_at: trx.fn.now() });
      await trx('pedido_items').where({ pedido_id: id }).delete();
      pedido = { id: antes.id, numero: antes.numero };
    } else {
      const [nuevo] = await trx('pedidos').insert({ cliente_id: i.clienteId, fecha_entrega: i.fechaEntrega, vehiculo: i.vehiculo, notas: i.notas, usuario_id: usuarioId }).returning(['id', 'numero']);
      pedido = nuevo!;
    }
    await trx('pedido_items').insert(i.items.map((x) => ({ pedido_id: pedido.id, variante_id: x.varianteId, paquetes: x.paquetes })));
    await actualizarEstadoPedido(trx, pedido.id);
    await auditar(trx, { usuarioId, accion: id ? 'editar' : 'crear', entidad: 'pedido', entidadId: pedido.id, despues: i });
    return pedido;
  });
}

/**
 * Estado de cobro de cada venta, como la columna "Estado" de la planilla. Lo cobrado al cliente (cobros + lo que
 * tenga a favor) se aplica a lo más viejo primero: saldo inicial, después las ventas por fecha. Una venta queda
 * cobrada, con parte cobrada o pendiente.
 */
export async function cobroPorVenta(db: Knex, ventaIds: string[]): Promise<Map<string, { cobrado: number; debe: number }>> {
  if (!ventaIds.length) return new Map();
  const { rows } = await db.raw<{ rows: { id: string; total: string; cobrado: string }[] }>(`
    with clientes as (select distinct cliente_id from ventas where id = any(?)),
    v as (
      select v.id, v.cliente_id, v.total_centavos as total,
        sum(v.total_centavos) over (partition by v.cliente_id order by v.fecha, v.numero) as acum
      from ventas v where v.anulado_at is null and v.cliente_id in (select cliente_id from clientes)),
    pago as (
      select c.cliente_id,
        coalesce((select sum(m.monto_centavos) from movimientos_dinero m where m.cliente_id = c.cliente_id and m.tipo = 'cobro' and m.anulado_at is null), 0)
        - coalesce((select sum(s.monto_centavos) from saldos_iniciales s where s.cliente_id = c.cliente_id and s.anulado_at is null), 0) as disponible
      from clientes c)
    select v.id, v.total, greatest(0, least(v.total, p.disponible - (v.acum - v.total))) as cobrado
    from v join pago p on p.cliente_id = v.cliente_id where v.id = any(?)`, [ventaIds, ventaIds]);
  return new Map(rows.map((r) => [r.id, { cobrado: Number(r.cobrado), debe: Number(r.total) - Number(r.cobrado) }]));
}
