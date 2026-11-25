import type { FastifyInstance } from 'fastify';
import type { Knex } from 'knex';
import { anularSchema, calcularVenta, choferSchema, IVA_CUENTA1, ordenSchema, PALET_DEFAULT, paletPlastificadoSchema, repartirCuentas, type OrdenInput } from '@moldeados/shared';
import { db } from '../db.js';
import { requerir, requerirAlguno } from '../lib/auth.js';
import { auditar } from '../lib/auditoria.js';
import { ConflictError, NotFoundError, ValidationError } from '../lib/errors.js';
import { idPorNumero } from '../lib/numero.js';
import { actualizarEstadoPedido, preciosParaCliente } from './ventas.service.js';

// Pedido N° 01: choferes, pallets cargados en la plastificadora (sin depender de la producción por turno) y la
// orden de venta: el gerente la emite, el mulero escanea cada pallet al subirlo y al completar se registra la venta.

const uuidOk = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);
const nro = (n: number | string) => String(n).padStart(6, '0');

// ---------- Pallet de la plastificadora ----------

export async function cargarPalletPlastificado(k: Knex, usuarioId: string, i: { varianteId: string; alto: number }) {
  return k.transaction(async (trx) => {
    const v = await trx('variantes').where({ id: i.varianteId, activo: true }).whereNull('deleted_at').first('id', 'codigo');
    if (!v) throw new ValidationError('Ese maple no existe o está desactivado');
    const { ancho, largo } = PALET_DEFAULT;
    // Sin palet_lotes: el stock ya no depende de la producción por turno (esa carga queda para costos, más adelante).
    const [p] = await trx('palets').insert({ variante_id: v.id, ancho, largo, alto: i.alto, paquetes: ancho * largo * i.alto, usuario_id: usuarioId, notas: 'Plastificadora' }).returning(['id', 'numero']);
    await auditar(trx, { usuarioId, accion: 'crear', entidad: 'palet', entidadId: p.id, despues: { ...i, codigo: v.codigo, origen: 'plastificadora' } });
    return p as { id: string; numero: number };
  });
}

/** Pallets en la fábrica por maple y alto (sin vender ni anular). Los que ya están escaneados en una orden abierta se cuentan aparte. */
export async function stockPorAlto(k: Knex) {
  const filas = await k('palets as p').join('variantes as v', 'v.id', 'p.variante_id')
    .whereNull('p.anulado_at').whereNull('p.venta_id').where('p.suelto', false)
    .groupBy('v.id', 'v.codigo', 'v.nombre', 'v.color_hex', 'v.maples_por_paquete', 'p.alto')
    .select('v.id as varianteId', 'v.codigo', 'v.nombre', 'v.color_hex as colorHex', 'v.maples_por_paquete as maplesPorPaquete', 'p.alto',
      k.raw('count(*)::int as pallets'), k.raw('sum(p.paquetes)::int as paquetes'),
      k.raw('count(*) filter (where exists (select 1 from orden_palets op where op.palet_id = p.id and op.vigente))::int as "enCarga"'))
    .orderBy([{ column: 'v.codigo' }, { column: 'p.alto', order: 'desc' }]);
  return filas as { varianteId: string; codigo: string; nombre: string; colorHex: string | null; maplesPorPaquete: number; alto: number; pallets: number; paquetes: number; enCarga: number }[];
}

// ---------- Orden de venta ----------

export async function crearOrden(k: Knex, usuarioId: string, i: OrdenInput) {
  return k.transaction(async (trx) => {
    const c = await trx('clientes').where({ id: i.clienteId }).whereNull('deleted_at').first('id');
    if (!c) throw new NotFoundError('No encontramos ese cliente');
    if (i.pedidoId && !(await trx('pedidos').where({ id: i.pedidoId, cliente_id: i.clienteId, estado: 'abierto' }).first('id'))) throw new ValidationError('Ese pedido ya no está abierto o es de otro cliente');
    if (i.choferId && !(await trx('choferes').where({ id: i.choferId }).whereNull('deleted_at').first('id'))) throw new NotFoundError('No encontramos ese chofer');
    const precios = await preciosParaCliente(trx, i.clienteId);
    const variantes = new Map((await trx('variantes').whereIn('id', i.items.map((x) => x.varianteId)).whereNull('deleted_at').select('id', 'codigo')).map((v) => [v.id as string, v.codigo as string]));
    const vistos = new Set<string>();
    for (const it of i.items) {
      const cod = variantes.get(it.varianteId);
      if (!cod) throw new ValidationError('Hay un maple que no existe');
      if (!(precios.get(it.varianteId) ?? 0)) throw new ValidationError(`El ${cod} no tiene precio. Cargalo en la ficha del cliente o en Ajustes › Precios.`);
      const clave = `${it.varianteId}:${it.alto}`;
      if (vistos.has(clave)) throw new ValidationError(`El ${cod} de ${it.alto} está dos veces: sumalo en un solo renglón.`);
      vistos.add(clave);
    }
    const [o] = await trx('ordenes').insert({
      cliente_id: i.clienteId, chofer_id: i.choferId, pedido_id: i.pedidoId, fecha: trx.raw('current_date'), condicion_pago: i.condicionPago,
      porcentaje_cuenta1: i.condicionPago === 'mixta' ? i.porcentajeCuenta1 : null, notas: i.notas, usuario_id: usuarioId,
    }).returning(['id', 'numero']);
    await trx('orden_items').insert(i.items.map((it) => ({ orden_id: o.id, variante_id: it.varianteId, alto: it.alto, cantidad: it.cantidad, precio_maple_centavos: precios.get(it.varianteId) })));
    await auditar(trx, { usuarioId, accion: 'crear', entidad: 'orden', entidadId: o.id, despues: i });
    return o as { id: string; numero: number };
  });
}

/** Lo que muestra la pantalla de carga: cada renglón con cuántos van escaneados. */
export async function verOrden(k: Knex | Knex.Transaction, id: string) {
  const o = await k('ordenes as o').join('clientes as c', 'c.id', 'o.cliente_id').leftJoin('choferes as ch', 'ch.id', 'o.chofer_id').where('o.id', id)
    .first('o.id', 'o.numero', 'o.fecha', 'o.estado', 'o.condicion_pago as condicionPago', 'o.porcentaje_cuenta1 as porcentajeCuenta1', 'o.notas', 'o.motivo', db.raw('(select numero from pedidos where id = o.pedido_id) as "pedidoNumero"'),
      'o.created_at as creadaAt', 'o.cerrada_at as cerradaAt', 'c.id as clienteId', 'c.nombre as cliente', 'c.cuit',
      k.raw("nullif(trim(coalesce(ch.nombre, '') || ' ' || coalesce(ch.apellido, '')), '') as chofer"), 'ch.dni', 'ch.patente', 'ch.vehiculo');
  if (!o) throw new NotFoundError('No encontramos esa orden');
  const items = await k('orden_items as i').join('variantes as v', 'v.id', 'i.variante_id').where('i.orden_id', id)
    .select('i.id', 'i.variante_id as varianteId', 'v.codigo', 'v.nombre', 'v.color_hex as colorHex', 'v.maples_por_paquete as maplesPorPaquete', 'i.alto', 'i.cantidad',
      'i.precio_maple_centavos as precioMaple',
      k.raw('(select count(*) from orden_palets op where op.item_id = i.id and op.vigente)::int as cargados'))
    .orderBy('v.codigo');
  const palets = await k('orden_palets as op').join('palets as p', 'p.id', 'op.palet_id').join('variantes as v', 'v.id', 'p.variante_id')
    .where('op.orden_id', id).where('op.vigente', true)
    .select('p.id', 'p.numero', 'v.codigo', 'p.alto', 'p.paquetes', 'v.maples_por_paquete as maplesPorPaquete', 'op.item_id as itemId', 'op.created_at as escaneadoAt')
    .orderBy('op.created_at');
  const ventas = await k('ventas').where({ orden_id: id }).select('id', 'numero', 'con_factura as cuenta1', 'total_centavos as total', 'anulado_at as anuladoAt').orderBy('numero');
  return { ...o, items, palets, ventas };
}

/** Número de pallet desde lo que manda la pistola: la URL del QR (…/palets/123) o el número solo. */
export const numeroDeEscaneo = (texto: string): number | null => {
  const m = /(\d{1,12})\D*$/.exec(texto.trim());
  return m ? Number(m[1]) : null;
};

export async function escanear(k: Knex, usuarioId: string, ordenId: string, codigo: string) {
  return k.transaction(async (trx) => {
    // Bloquea la orden: dos escaneos a la vez no pueden pasarse del total.
    const o = await trx('ordenes').where({ id: ordenId }).forUpdate().first('id', 'estado');
    if (!o) throw new NotFoundError('No encontramos esa orden');
    if (o.estado !== 'abierta') throw new ConflictError('Esta orden ya está cerrada: no acepta más pallets.');
    const n = numeroDeEscaneo(codigo);
    const p = n === null ? null : await trx('palets as p').join('variantes as v', 'v.id', 'p.variante_id').where('p.numero', n).forUpdate('p')
      .first('p.id', 'p.numero', 'p.variante_id', 'p.alto', 'p.anulado_at', 'p.venta_id', 'p.suelto', 'v.codigo');
    if (!p || p.suelto) throw new ValidationError('Ese QR no es de ningún pallet.');
    if (p.anulado_at) throw new ConflictError(`El pallet ${nro(p.numero)} está anulado.`);
    if (p.venta_id) throw new ConflictError(`El pallet ${nro(p.numero)} ya se vendió.`);
    const otra = await trx('orden_palets as op').join('ordenes as o', 'o.id', 'op.orden_id').where({ 'op.palet_id': p.id, 'op.vigente': true }).first('o.id', 'o.numero');
    if (otra) throw new ConflictError(otra.id === ordenId ? `El pallet ${nro(p.numero)} ya está escaneado.` : `El pallet ${nro(p.numero)} ya está cargado en la orden ${nro(otra.numero)}.`);
    const items = await trx('orden_items as i').where('i.orden_id', ordenId)
      .select('i.id', 'i.variante_id', 'i.alto', 'i.cantidad', trx.raw('(select count(*) from orden_palets op where op.item_id = i.id and op.vigente)::int as cargados'));
    if (items.every((i) => i.cargados >= i.cantidad)) throw new ConflictError('La orden ya está completa.');
    const item = items.find((i) => i.variante_id === p.variante_id && i.alto === p.alto);
    if (!item) throw new ValidationError(`El pallet ${nro(p.numero)} es ${p.codigo} de ${p.alto}: no corresponde a esta orden.`);
    if (item.cargados >= item.cantidad) throw new ConflictError(`Ya están todos los ${p.codigo} de ${p.alto} (${item.cantidad} de ${item.cantidad}).`);
    await trx('orden_palets').insert({ orden_id: ordenId, item_id: item.id, palet_id: p.id, usuario_id: usuarioId });
    const completa = items.every((i) => (i.id === item.id ? i.cargados + 1 : i.cargados) >= i.cantidad);
    // Último pallet: se cierra sola (descuenta stock y registra la venta).
    if (completa) await cerrar(trx, usuarioId, ordenId, null);
    return { palet: nro(p.numero), codigo: p.codigo, alto: p.alto, completa };
  });
}

/**
 * Cierra la orden con lo escaneado: los pallets salen del stock y se registra la venta (pendiente de cobro) según
 * la condición de pago. Mixta = dos ventas, una por cuenta, con los maples repartidos por el porcentaje.
 */
async function cerrar(trx: Knex.Transaction, usuarioId: string, ordenId: string, motivo: string | null) {
  const o = await trx('ordenes').where({ id: ordenId }).first('id', 'numero', 'cliente_id', 'fecha', 'condicion_pago', 'porcentaje_cuenta1', 'chofer_id', 'pedido_id');
  const palets = await trx('orden_palets as op').join('palets as p', 'p.id', 'op.palet_id').join('variantes as v', 'v.id', 'p.variante_id').join('orden_items as i', 'i.id', 'op.item_id')
    .where({ 'op.orden_id': ordenId, 'op.vigente': true })
    .select('p.id', 'p.variante_id', 'p.paquetes', 'v.maples_por_paquete', 'i.precio_maple_centavos as precio');
  if (!palets.length) throw new ValidationError('No se escaneó ningún pallet. Si el camión no se lleva nada, cancelá la orden.');
  const ch = o.chofer_id ? await trx('choferes').where({ id: o.chofer_id }).first('nombre', 'apellido', 'patente', 'vehiculo') : null;
  const reparto = palets.map((p) => ({ p, ...repartirCuentas(p.paquetes * p.maples_por_paquete, o.condicion_pago, o.porcentaje_cuenta1) }));
  const ventas: string[] = [];
  for (const cuenta of ['cuenta1', 'cuenta2'] as const) {
    const items = reparto.filter((r) => r[cuenta] > 0).map((r) => ({ palet: r.p, maples: r[cuenta], precioMaple: Number(r.p.precio) }));
    if (!items.length) continue;
    const ivaBp = cuenta === 'cuenta1' ? IVA_CUENTA1 : 0;
    const t = calcularVenta(items, ivaBp);
    const [v] = await trx('ventas').insert({
      orden_id: ordenId, pedido_id: o.pedido_id, cliente_id: o.cliente_id, fecha: o.fecha, con_factura: cuenta === 'cuenta1', iva_bp: ivaBp,
      neto_centavos: t.neto, iva_centavos: t.iva, total_centavos: t.total, vehiculo: ch?.vehiculo ?? null, patente: ch?.patente ?? null,
      retira: ch ? `${ch.nombre} ${ch.apellido}` : null, notas: `Orden ${nro(o.numero)}`, usuario_id: usuarioId,
    }).returning(['id', 'numero']);
    await trx('venta_items').insert(items.map((it) => ({
      venta_id: v.id, palet_id: it.palet.id, variante_id: it.palet.variante_id, maples: it.maples, precio_maple_centavos: it.precioMaple, subtotal_centavos: it.maples * it.precioMaple, calidad: 'primera',
    })));
    ventas.push(v.id);
  }
  // El pallet queda ligado a la primera venta (si es Mixta, la otra tiene sus mismos pallets con la otra parte de los maples).
  await trx('palets').whereIn('id', palets.map((p) => p.id)).update({ venta_id: ventas[0], updated_at: trx.fn.now() });
  await trx('ordenes').where({ id: ordenId }).update({ estado: 'cerrada', cerrada_at: trx.fn.now(), cerrada_por: usuarioId, motivo, updated_at: trx.fn.now() });
  if (o.pedido_id) await actualizarEstadoPedido(trx, o.pedido_id);
  await auditar(trx, { usuarioId, accion: 'editar', entidad: 'orden', entidadId: ordenId, despues: { estado: 'cerrada', palets: palets.length, ventas }, motivo });
}

export async function cerrarCorta(k: Knex, usuarioId: string, ordenId: string, motivo: string | null) {
  await k.transaction(async (trx) => {
    const o = await trx('ordenes').where({ id: ordenId }).forUpdate().first('estado');
    if (!o) throw new NotFoundError('No encontramos esa orden');
    if (o.estado !== 'abierta') throw new ConflictError('Esta orden ya está cerrada o cancelada');
    await cerrar(trx, usuarioId, ordenId, motivo ?? 'Cerrada con lo cargado');
  });
}

export async function cancelarOrden(k: Knex, usuarioId: string, ordenId: string, motivo: string) {
  await k.transaction(async (trx) => {
    const o = await trx('ordenes').where({ id: ordenId }).forUpdate().first('estado');
    if (!o) throw new NotFoundError('No encontramos esa orden');
    if (o.estado !== 'abierta') throw new ConflictError('Esta orden ya está cerrada o cancelada');
    // Los pallets que se habían escaneado vuelven al stock.
    await trx('orden_palets').where({ orden_id: ordenId, vigente: true }).update({ vigente: false });
    await trx('ordenes').where({ id: ordenId }).update({ estado: 'cancelada', cerrada_at: trx.fn.now(), cerrada_por: usuarioId, motivo, updated_at: trx.fn.now() });
    await auditar(trx, { usuarioId, accion: 'anular', entidad: 'orden', entidadId: ordenId, motivo });
  });
}

// ---------- Rutas ----------

export async function ordenesRoutes(app: FastifyInstance): Promise<void> {
  // Choferes
  app.get<{ Querystring: { clienteId?: string } }>('/choferes', async (req) => {
    await requerir(db, req, 'ventas', 1);
    const cliente = uuidOk(req.query.clienteId) ?? null;
    const filas = await db('choferes as ch').whereNull('ch.deleted_at')
      .select('ch.id', 'ch.nombre', 'ch.apellido', 'ch.dni', 'ch.telefono', 'ch.patente', 'ch.vehiculo',
        db.raw("coalesce((select json_agg(json_build_object('id', c.id, 'nombre', c.nombre) order by c.nombre) from chofer_clientes cc join clientes c on c.id = cc.cliente_id where cc.chofer_id = ch.id and c.deleted_at is null), '[]') as clientes"),
        db.raw('exists (select 1 from chofer_clientes cc where cc.chofer_id = ch.id and cc.cliente_id = ?) as "delCliente"', [cliente]))
      // Los del cliente de la orden, primero.
      .orderByRaw('"delCliente" desc, ch.apellido, ch.nombre');
    return { data: filas };
  });
  const guardarChofer = async (usuarioId: string, body: unknown, id?: string) => {
    const i = choferSchema.parse(body);
    return db.transaction(async (trx) => {
      const fila = { nombre: i.nombre, apellido: i.apellido, dni: i.dni, telefono: i.telefono, patente: i.patente, vehiculo: i.vehiculo, updated_at: trx.fn.now() };
      let choferId = id;
      if (id) {
        const antes = await trx('choferes').where({ id }).whereNull('deleted_at').first('*');
        if (!antes) throw new NotFoundError('No encontramos ese chofer');
        await trx('choferes').where({ id }).update(fila);
        await trx('chofer_clientes').where({ chofer_id: id }).delete();
      } else {
        choferId = (await trx('choferes').insert(fila).returning('id'))[0].id;
      }
      const clientes = [...new Set(i.clienteIds)];
      if (clientes.length) await trx('chofer_clientes').insert(clientes.map((c) => ({ chofer_id: choferId, cliente_id: c })));
      await auditar(trx, { usuarioId, accion: id ? 'editar' : 'crear', entidad: 'chofer', entidadId: choferId, despues: i });
      return { id: choferId! };
    });
  };
  app.post('/choferes', async (req, reply) => {
    const s = await requerir(db, req, 'ventas', 2);
    return reply.code(201).send({ data: await guardarChofer(s.usuarioId, req.body) });
  });
  app.put<{ Params: { id: string } }>('/choferes/:id', async (req) => {
    const s = await requerir(db, req, 'ventas', 2);
    return { data: await guardarChofer(s.usuarioId, req.body, uuidOk(req.params.id) ?? '00000000-0000-0000-0000-000000000000') };
  });
  app.delete<{ Params: { id: string } }>('/choferes/:id', async (req) => {
    const s = await requerir(db, req, 'ventas', 2);
    const id = uuidOk(req.params.id) ?? null;
    const n = await db('choferes').where({ id }).whereNull('deleted_at').update({ deleted_at: db.fn.now() });
    if (!n) throw new NotFoundError('No encontramos ese chofer');
    await auditar(db, { usuarioId: s.usuarioId, accion: 'borrar', entidad: 'chofer', entidadId: id });
    return { data: { ok: true } };
  });

  // Plastificadora y stock
  app.post('/palets/plastificado', async (req, reply) => {
    const s = await requerir(db, req, 'produccion', 2);
    return reply.code(201).send({ data: await cargarPalletPlastificado(db, s.usuarioId, paletPlastificadoSchema.parse(req.body)) });
  });
  app.get('/stock-palets', async (req) => {
    await requerirAlguno(db, req, [['produccion', 1], ['ventas', 1]]);
    return { data: await stockPorAlto(db) };
  });

  // Órdenes
  app.get<{ Querystring: { estado?: string } }>('/ordenes', async (req) => {
    await requerirAlguno(db, req, [['ventas', 1], ['produccion', 2]]);
    const estado = ['abierta', 'cerrada', 'cancelada'].includes(req.query.estado ?? '') ? req.query.estado : 'abierta';
    const filas = await db('ordenes as o').join('clientes as c', 'c.id', 'o.cliente_id').leftJoin('choferes as ch', 'ch.id', 'o.chofer_id').where('o.estado', estado)
      .select('o.id', 'o.numero', 'o.fecha', 'o.estado', 'o.condicion_pago as condicionPago', 'c.nombre as cliente',
        db.raw("nullif(trim(coalesce(ch.nombre, '') || ' ' || coalesce(ch.apellido, '')), '') as chofer"), 'ch.patente',
        db.raw('(select sum(i.cantidad) from orden_items i where i.orden_id = o.id)::int as pedidos'),
        db.raw('(select count(*) from orden_palets op where op.orden_id = o.id and op.vigente)::int as cargados'),
        db.raw("(select string_agg(i.cantidad || ' ' || v.codigo || ' de ' || i.alto, ' + ' order by v.codigo) from orden_items i join variantes v on v.id = i.variante_id where i.orden_id = o.id) as detalle"))
      .orderBy('o.numero', estado === 'abierta' ? 'asc' : 'desc').limit(100);
    return { data: filas };
  });
  app.get<{ Params: { id: string } }>('/ordenes/:id', async (req) => {
    await requerirAlguno(db, req, [['ventas', 1], ['produccion', 2]]);
    return { data: await verOrden(db, await idPorNumero(db, 'ordenes', req.params.id) || '00000000-0000-0000-0000-000000000000') };
  });
  app.post('/ordenes', async (req, reply) => {
    const s = await requerir(db, req, 'ventas', 3);
    return reply.code(201).send({ data: await crearOrden(db, s.usuarioId, ordenSchema.parse(req.body)) });
  });
  app.post<{ Params: { id: string }; Body: { codigo?: string } }>('/ordenes/:id/escanear', async (req) => {
    const s = await requerirAlguno(db, req, [['produccion', 2], ['ventas', 2]]);
    return { data: await escanear(db, s.usuarioId, uuidOk(req.params.id) ?? '00000000-0000-0000-0000-000000000000', String(req.body?.codigo ?? '').slice(0, 300)) };
  });
  // Cerrar con lo cargado y cancelar: solo el gerente (o el dueño), desde la compu. El mulero no.
  app.post<{ Params: { id: string }; Body: { motivo?: string } }>('/ordenes/:id/cerrar', async (req) => {
    const s = await requerir(db, req, 'ventas', 3);
    await cerrarCorta(db, s.usuarioId, uuidOk(req.params.id) ?? '00000000-0000-0000-0000-000000000000', req.body?.motivo?.trim().slice(0, 500) || null);
    return { data: { ok: true } };
  });
  app.post<{ Params: { id: string } }>('/ordenes/:id/cancelar', async (req) => {
    const s = await requerir(db, req, 'ventas', 3);
    const { motivo } = anularSchema.parse(req.body);
    await cancelarOrden(db, s.usuarioId, uuidOk(req.params.id) ?? '00000000-0000-0000-0000-000000000000', motivo);
    return { data: { ok: true } };
  });
}
