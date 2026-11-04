import type { FastifyInstance } from 'fastify';
import { anularSchema, bancoSchema, clienteSchema, movimientoDineroSchema, pedidoSchema, precioSchema, ventaSchema } from '@moldeados/shared';
import { db } from '../db.js';
import { buscar } from '../lib/buscar.js';
import { matriz, requerir, requerirAlguno } from '../lib/auth.js';
import { auditar } from '../lib/auditoria.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import { materiasPorAcabarse, recompra } from './avisos.service.js';
import { maquinasConService } from './produccion.service.js';
import { actualizarEstadoPedido, despachadoDelPedido, guardarFirma, guardarPedido, anularMovimiento, anularVenta, cambiarEstadoCheque, crearMovimiento, crearVenta, cuentaCorriente, preciosParaCliente, saldos } from './ventas.service.js';

// Clientes, precios, ventas (despacho de palets), bancos, cobros/pagos y cuentas corrientes.
// ponytail: CRUD chico con la query en la ruta; las reglas viven en ventas.service.

const fechaOk = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
const uuidOk = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);
const COLS_CLIENTE = ['id', 'nombre', 'cuit', 'telefono', 'email', 'direccion', 'vehiculo_habitual as vehiculoHabitual', 'notas'];
const filaCliente = (i: ReturnType<typeof clienteSchema.parse>) => ({ nombre: i.nombre, cuit: i.cuit, telefono: i.telefono, email: i.email, direccion: i.direccion, vehiculo_habitual: i.vehiculoHabitual, notas: i.notas });

export async function ventasRoutes(app: FastifyInstance): Promise<void> {
  // ---------- Bancos ----------
  app.get('/bancos', async (req) => {
    await requerirAlguno(db, req, [['cuentas', 1], ['ventas', 1]]);
    return { data: await db('bancos').whereNull('deleted_at').orderBy('nombre').select('id', 'nombre', 'activo') };
  });
  app.post('/bancos', async (req, reply) => {
    const s = await requerir(db, req, 'cuentas', 3);
    const i = bancoSchema.parse(req.body);
    const [b] = await db('bancos').insert(i).returning('id');
    await auditar(db, { usuarioId: s.usuarioId, accion: 'crear', entidad: 'banco', entidadId: b.id, despues: i });
    return reply.code(201).send({ data: b });
  });
  app.put<{ Params: { id: string } }>('/bancos/:id', async (req) => {
    const s = await requerir(db, req, 'cuentas', 3);
    const i = bancoSchema.parse(req.body);
    const n = await db('bancos').where({ id: uuidOk(req.params.id) ?? null }).whereNull('deleted_at').update({ ...i, updated_at: db.fn.now() });
    if (!n) throw new NotFoundError('No encontramos ese banco');
    await auditar(db, { usuarioId: s.usuarioId, accion: 'editar', entidad: 'banco', entidadId: req.params.id, despues: i });
    return { data: { ok: true } };
  });

  // ---------- Clientes ----------
  app.get<{ Querystring: { q?: string } }>('/clientes', async (req) => {
    await requerirAlguno(db, req, [['ventas', 1], ['cuentas', 1]]);
    const q = req.query.q?.trim();
    return {
      data: await db('clientes as c').whereNull('c.deleted_at')
        .modify(buscar(q, ['c.nombre', 'c.cuit', 'c.telefono']))
        .select(COLS_CLIENTE.map((c) => `c.${c}`))
        .select(db.raw('(select max(v.fecha) from ventas v where v.cliente_id = c.id and v.anulado_at is null) as "ultimaVenta"'))
        .orderBy('c.nombre').limit(200),
    };
  });
  app.get<{ Params: { id: string } }>('/clientes/:id', async (req) => {
    await requerirAlguno(db, req, [['ventas', 1], ['cuentas', 1]]);
    const c = await db('clientes').where({ id: uuidOk(req.params.id) ?? null }).whereNull('deleted_at').first(COLS_CLIENTE);
    if (!c) throw new NotFoundError('No encontramos ese cliente');
    const especiales = await db('precios_cliente as p').join('variantes as v', 'v.id', 'p.variante_id').where('p.cliente_id', c.id)
      .select('v.id as varianteId', 'v.codigo', 'v.color_hex as colorHex', 'p.precio_maple_centavos as precioMaple', 'v.precio_maple_centavos as precioLista');
    return { data: { ...c, especiales } };
  });
  app.post('/clientes', async (req, reply) => {
    const s = await requerir(db, req, 'ventas', 2);
    const i = clienteSchema.parse(req.body);
    const c = await db.transaction(async (trx) => {
      const [f] = await trx('clientes').insert(filaCliente(i)).returning(COLS_CLIENTE);
      await auditar(trx, { usuarioId: s.usuarioId, accion: 'crear', entidad: 'cliente', entidadId: f.id, despues: i });
      return f;
    });
    return reply.code(201).send({ data: c });
  });
  app.put<{ Params: { id: string } }>('/clientes/:id', async (req) => {
    const s = await requerir(db, req, 'ventas', 3);
    const i = clienteSchema.parse(req.body);
    return db.transaction(async (trx) => {
      const antes = await trx('clientes').where({ id: uuidOk(req.params.id) ?? null }).whereNull('deleted_at').first(COLS_CLIENTE);
      if (!antes) throw new NotFoundError('No encontramos ese cliente');
      await trx('clientes').where({ id: antes.id }).update({ ...filaCliente(i), updated_at: trx.fn.now() });
      await auditar(trx, { usuarioId: s.usuarioId, accion: 'editar', entidad: 'cliente', entidadId: antes.id, antes, despues: i });
      return { data: { ok: true } };
    });
  });
  app.delete<{ Params: { id: string } }>('/clientes/:id', async (req) => {
    const s = await requerir(db, req, 'ventas', 3);
    const n = await db('clientes').where({ id: uuidOk(req.params.id) ?? null }).whereNull('deleted_at').update({ deleted_at: db.fn.now() });
    if (!n) throw new NotFoundError('No encontramos ese cliente');
    await auditar(db, { usuarioId: s.usuarioId, accion: 'borrar', entidad: 'cliente', entidadId: req.params.id });
    return { data: { ok: true } };
  });

  // ---------- Avisos ----------
  // Lo que el sistema detecta solo. Cada sección sale según los permisos de quien mira.
  app.get('/avisos', async (req) => {
    const s = await requerirAlguno(db, req, [['ventas', 1], ['materias', 1], ['compras', 1], ['produccion', 1]]);
    const m = (await matriz(db))[s.rol];
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
    return {
      data: {
        clientes: m.ventas >= 1 ? await recompra(db, hoy) : null,
        materias: m.materias >= 1 || m.compras >= 1 ? await materiasPorAcabarse(db) : null,
        maquinas: m.produccion >= 1 || m.productos >= 1 ? (await maquinasConService(db)).filter((x) => x.activo && x.leTocaService) : null,
      },
    };
  });
  app.post<{ Params: { id: string } }>('/clientes/:id/contactado', async (req) => {
    const s = await requerir(db, req, 'ventas', 2);
    const n = await db('clientes').where({ id: uuidOk(req.params.id) ?? null }).whereNull('deleted_at').update({ contactado_at: db.fn.now() });
    if (!n) throw new NotFoundError('No encontramos ese cliente');
    await auditar(db, { usuarioId: s.usuarioId, accion: 'editar', entidad: 'cliente', entidadId: req.params.id, motivo: 'Contactado por recompra' });
    return { data: { ok: true } };
  });

  // ---------- Precios ----------
  app.get('/precios', async (req) => {
    await requerir(db, req, 'ventas', 1);
    return {
      data: await db('variantes as v').whereNull('v.deleted_at')
        .select('v.id', 'v.codigo', 'v.nombre', 'v.color_hex as colorHex', 'v.maples_por_paquete as maplesPorPaquete', 'v.precio_maple_centavos as precioMaple', 'v.activo',
          db.raw('(select count(*)::int from precios_cliente p join clientes c on c.id = p.cliente_id where p.variante_id = v.id and c.deleted_at is null) as especiales'))
        .orderBy('v.codigo'),
    };
  });
  app.get<{ Params: { id: string } }>('/precios/cliente/:id', async (req) => {
    await requerir(db, req, 'ventas', 1);
    return { data: Object.fromEntries(await preciosParaCliente(db, uuidOk(req.params.id) ?? null)) };
  });
  app.put('/precios', async (req) => {
    const s = await requerir(db, req, 'ventas', 3);
    const i = precioSchema.parse(req.body);
    await db.transaction(async (trx) => {
      if (!i.clienteId) {
        if (i.precioMaple === null) throw new NotFoundError('Ingresá el precio de lista');
        await trx('variantes').where({ id: i.varianteId }).update({ precio_maple_centavos: i.precioMaple, updated_at: trx.fn.now() });
      } else if (i.precioMaple === null) {
        await trx('precios_cliente').where({ cliente_id: i.clienteId, variante_id: i.varianteId }).delete();
      } else {
        await trx('precios_cliente').insert({ cliente_id: i.clienteId, variante_id: i.varianteId, precio_maple_centavos: i.precioMaple }).onConflict(['cliente_id', 'variante_id']).merge();
      }
      await auditar(trx, { usuarioId: s.usuarioId, accion: 'editar', entidad: 'precio', entidadId: i.varianteId, despues: i });
    });
    return { data: { ok: true } };
  });

  // ---------- Despacho / ventas ----------
  // Palets listos para salir: armados, vigentes y sin vender. Lo usa el despacho (y el escáner).
  app.get('/palets-disponibles', async (req) => {
    await requerir(db, req, 'ventas', 2);
    return {
      data: await db('palets as pa').join('variantes as v', 'v.id', 'pa.variante_id').whereNull('pa.anulado_at').whereNull('pa.venta_id')
        .select('pa.id', 'pa.numero', 'pa.paquetes', 'pa.ancho', 'pa.largo', 'pa.alto', 'pa.destino', 'pa.created_at as armadoAt',
          'v.id as varianteId', 'v.codigo', 'v.nombre as variante', 'v.color_hex as colorHex', 'v.maples_por_paquete as maplesPorPaquete')
        .orderBy('pa.numero'),
    };
  });

  app.get<{ Querystring: { desde?: string; hasta?: string; clienteId?: string; pagina?: string; q?: string } }>('/ventas', async (req) => {
    await requerir(db, req, 'ventas', 1);
    const q = req.query;
    return {
      data: await db('ventas as v').join('clientes as c', 'c.id', 'v.cliente_id')
        .modify((qb) => {
          if (fechaOk(q.desde)) qb.where('v.fecha', '>=', q.desde!);
          if (fechaOk(q.hasta)) qb.where('v.fecha', '<=', q.hasta!);
          if (uuidOk(q.clienteId)) qb.where('v.cliente_id', q.clienteId!);
        })
        .modify(buscar(q.q, ['c.nombre', 'v.retira', 'v.patente', 'v.nro_factura'], 'v.numero'))
        .select('v.id', 'v.numero', 'v.fecha', 'v.total_centavos as total', 'v.con_factura as conFactura', 'v.retira', 'v.anulado_at as anuladoAt', 'c.nombre as cliente',
          db.raw('(select count(*)::int from venta_items i where i.venta_id = v.id) as palets'),
          db.raw('(select coalesce(sum(i.maples), 0)::int from venta_items i where i.venta_id = v.id) as maples'))
        .orderBy([{ column: 'v.fecha', order: 'desc' }, { column: 'v.numero', order: 'desc' }])
        .limit(50).offset(Math.max(0, Number(q.pagina) || 0) * 50),
    };
  });

  app.get<{ Params: { id: string } }>('/ventas/:id', async (req) => {
    await requerir(db, req, 'ventas', 1);
    const v = await db('ventas as v').join('clientes as c', 'c.id', 'v.cliente_id').join('usuarios as u', 'u.id', 'v.usuario_id').leftJoin('usuarios as ua', 'ua.id', 'v.anulado_por')
      .where('v.id', uuidOk(req.params.id) ?? null)
      .first('v.id', 'v.numero', 'v.fecha', 'v.con_factura as conFactura', 'v.nro_factura as nroFactura', 'v.iva_bp as ivaBp', 'v.neto_centavos as neto', 'v.iva_centavos as iva',
        'v.total_centavos as total', 'v.vehiculo', 'v.patente', 'v.retira', 'v.notas', 'v.created_at as cargadaAt', 'v.anulado_at as anuladoAt', 'v.motivo_anulacion as motivoAnulacion',
        'ua.nombre as anuladoPor', 'u.nombre as cargadoPor', 'c.id as clienteId', 'c.nombre as cliente', 'c.cuit as clienteCuit', 'c.direccion as clienteDireccion',
        'v.firma_id as firmaId', 'v.firmado_at as firmadoAt', 'v.pedido_id as pedidoId', db.raw('(select numero from pedidos where id = v.pedido_id) as "pedidoNumero"'));
    if (!v) throw new NotFoundError('No encontramos esa venta');
    const items = await db('venta_items as i').join('palets as p', 'p.id', 'i.palet_id').join('variantes as va', 'va.id', 'i.variante_id').where('i.venta_id', v.id)
      .select('i.id', 'p.id as paletId', 'p.numero as palet', 'p.suelto', 'p.paquetes', 'va.codigo', 'va.nombre as variante', 'va.color_hex as colorHex', 'i.maples', 'i.precio_maple_centavos as precioMaple', 'i.subtotal_centavos as subtotal')
      .orderBy('p.numero');
    return { data: { ...v, items } };
  });

  app.post('/ventas', async (req, reply) => {
    const s = await requerir(db, req, 'ventas', 2);
    const i = ventaSchema.parse(req.body);
    // Cambiar precios en el momento es de quien tiene "todo" en ventas; el resto despacha a precio de lista/cliente.
    if ((await matriz(db))[s.rol].ventas < 3) i.precios = [];
    return reply.code(201).send({ data: await crearVenta(db, s.usuarioId, i) });
  });
  app.post<{ Params: { id: string } }>('/ventas/:id/anular', async (req) => {
    const s = await requerir(db, req, 'ventas', 3);
    if (!uuidOk(req.params.id)) throw new NotFoundError('No encontramos esa venta');
    await anularVenta(db, s.usuarioId, req.params.id, anularSchema.parse(req.body).motivo);
    return { data: { ok: true } };
  });

  // Firmar un remito ya hecho (si no se firmó en el despacho).
  app.post<{ Params: { id: string }; Body: { firma?: string } }>('/ventas/:id/firma', { bodyLimit: 1024 * 1024 }, async (req) => {
    const s = await requerir(db, req, 'ventas', 2);
    if (!uuidOk(req.params.id) || typeof req.body?.firma !== 'string') throw new NotFoundError('No encontramos esa venta');
    await db.transaction(async (trx) => {
      const v = await trx('ventas').where({ id: req.params.id }).forUpdate().first('id', 'firma_id', 'anulado_at');
      if (!v || v.anulado_at) throw new NotFoundError('No encontramos esa venta');
      if (v.firma_id) throw new ConflictError('Este remito ya está firmado');
      const id = await guardarFirma(trx, s.usuarioId, req.body.firma!);
      await trx('ventas').where({ id: v.id }).update({ firma_id: id, firmado_at: trx.fn.now(), updated_at: trx.fn.now() });
      await auditar(trx, { usuarioId: s.usuarioId, accion: 'editar', entidad: 'venta', entidadId: v.id, motivo: 'Remito firmado' });
    });
    return { data: { ok: true } };
  });

  // ---------- Pedidos ----------
  const SUMA_DESPACHADO = `coalesce((select sum(pa.paquetes) from palets pa join ventas ve on ve.id = pa.venta_id
    where ve.pedido_id = p.id and ve.anulado_at is null), 0)::int`;
  app.get<{ Querystring: { estado?: string; clienteId?: string; q?: string } }>('/pedidos', async (req) => {
    await requerir(db, req, 'ventas', 1);
    const { estado = 'abierto', clienteId, q } = req.query;
    return {
      data: await db('pedidos as p').join('clientes as c', 'c.id', 'p.cliente_id')
        .modify((qb) => {
          if (['abierto', 'entregado', 'cancelado'].includes(estado)) qb.where('p.estado', estado);
          if (uuidOk(clienteId)) qb.where('p.cliente_id', clienteId!);
        })
        .modify(buscar(q, ['c.nombre', 'p.notas'], 'p.numero'))
        .select('p.id', 'p.numero', 'p.estado', 'p.fecha_entrega as fechaEntrega', 'p.vehiculo', 'p.notas', 'p.created_at as cargadoAt', 'c.id as clienteId', 'c.nombre as cliente',
          db.raw('(select sum(i.paquetes) from pedido_items i where i.pedido_id = p.id)::int as paquetes'),
          db.raw(`${SUMA_DESPACHADO} as despachado`),
          db.raw(`(select string_agg(v.codigo || ' × ' || i.paquetes, ', ' order by v.codigo) from pedido_items i join variantes v on v.id = i.variante_id where i.pedido_id = p.id) as resumen`))
        .orderByRaw('p.fecha_entrega asc nulls last, p.numero desc').limit(200),
    };
  });
  app.get<{ Params: { id: string } }>('/pedidos/:id', async (req) => {
    await requerir(db, req, 'ventas', 1);
    const p = await db('pedidos as p').join('clientes as c', 'c.id', 'p.cliente_id').join('usuarios as u', 'u.id', 'p.usuario_id').where('p.id', uuidOk(req.params.id) ?? null)
      .first('p.id', 'p.numero', 'p.estado', 'p.fecha_entrega as fechaEntrega', 'p.vehiculo', 'p.notas', 'p.created_at as cargadoAt', 'u.nombre as cargadoPor', 'c.id as clienteId', 'c.nombre as cliente');
    if (!p) throw new NotFoundError('No encontramos ese pedido');
    const hecho = await despachadoDelPedido(db, p.id);
    const items = (await db('pedido_items as i').join('variantes as v', 'v.id', 'i.variante_id').where('i.pedido_id', p.id)
      .select('v.id as varianteId', 'v.codigo', 'v.nombre', 'v.color_hex as colorHex', 'v.maples_por_paquete as maplesPorPaquete', 'i.paquetes').orderBy('v.codigo'))
      .map((i) => ({ ...i, despachado: hecho.get(i.varianteId) ?? 0 }));
    const ventas = await db('ventas').where({ pedido_id: p.id }).orderBy('fecha').select('id', 'numero', 'fecha', 'retira', 'total_centavos as total', 'anulado_at as anuladoAt');
    return { data: { ...p, items, ventas } };
  });
  app.post('/pedidos', async (req, reply) => {
    const s = await requerir(db, req, 'ventas', 2);
    return reply.code(201).send({ data: await guardarPedido(db, s.usuarioId, pedidoSchema.parse(req.body)) });
  });
  app.put<{ Params: { id: string } }>('/pedidos/:id', async (req) => {
    const s = await requerir(db, req, 'ventas', 2);
    if (!uuidOk(req.params.id)) throw new NotFoundError('No encontramos ese pedido');
    return { data: await guardarPedido(db, s.usuarioId, pedidoSchema.parse(req.body), req.params.id) };
  });
  app.post<{ Params: { id: string }; Body: { cancelar?: boolean; motivo?: string } }>('/pedidos/:id/estado', async (req) => {
    const s = await requerir(db, req, 'ventas', 2);
    if (!uuidOk(req.params.id)) throw new NotFoundError('No encontramos ese pedido');
    await db.transaction(async (trx) => {
      const p = await trx('pedidos').where({ id: req.params.id }).forUpdate().first('id', 'estado');
      if (!p) throw new NotFoundError('No encontramos ese pedido');
      if (req.body?.cancelar) await trx('pedidos').where({ id: p.id }).update({ estado: 'cancelado', updated_at: trx.fn.now() });
      else { await trx('pedidos').where({ id: p.id }).update({ estado: 'abierto', updated_at: trx.fn.now() }); await actualizarEstadoPedido(trx, p.id); }
      await auditar(trx, { usuarioId: s.usuarioId, accion: req.body?.cancelar ? 'anular' : 'editar', entidad: 'pedido', entidadId: p.id, motivo: req.body?.motivo ?? (req.body?.cancelar ? 'Cancelado' : 'Reabierto') });
    });
    return { data: { ok: true } };
  });

  // ---------- Cobros y pagos ----------
  app.get<{ Querystring: { tipo?: string; desde?: string; hasta?: string } }>('/dinero', async (req) => {
    await requerir(db, req, 'cuentas', 1);
    const q = req.query;
    return {
      data: await db('movimientos_dinero as m').leftJoin('clientes as c', 'c.id', 'm.cliente_id').leftJoin('proveedores as p', 'p.id', 'm.proveedor_id').leftJoin('bancos as b', 'b.id', 'm.banco_id')
        .modify((qb) => {
          if (q.tipo === 'cobro' || q.tipo === 'pago') qb.where('m.tipo', q.tipo);
          if (fechaOk(q.desde)) qb.where('m.fecha', '>=', q.desde!);
          if (fechaOk(q.hasta)) qb.where('m.fecha', '<=', q.hasta!);
        })
        .select('m.id', 'm.numero', 'm.tipo', 'm.fecha', 'm.monto_centavos as monto', 'm.medio', 'b.nombre as banco', 'm.cheque_numero as chequeNumero', 'm.cheque_fecha_cobro as chequeFechaCobro',
          'm.referencia', 'm.anulado_at as anuladoAt', db.raw('coalesce(c.nombre, p.nombre) as contraparte'), 'm.cliente_id as clienteId', 'm.proveedor_id as proveedorId')
        .orderBy([{ column: 'm.fecha', order: 'desc' }, { column: 'm.numero', order: 'desc' }]).limit(100),
    };
  });
  // Cheques: los recibidos en cartera (sin importar la fecha: hay que depositarlos o endosarlos) y los emitidos
  // propios que todavía no vencieron (hay que tener fondos). Los endosados se ven en el pago al proveedor.
  app.get('/cheques', async (req) => {
    await requerir(db, req, 'cuentas', 1);
    return {
      data: await db('movimientos_dinero as m').leftJoin('clientes as c', 'c.id', 'm.cliente_id').leftJoin('proveedores as p', 'p.id', 'm.proveedor_id').leftJoin('bancos as b', 'b.id', 'm.banco_id')
        .whereIn('m.medio', ['cheque', 'echeq']).whereNull('m.anulado_at')
        .where((w) => w.where('m.cheque_estado', 'cartera').orWhere((e) => e.where('m.tipo', 'pago').where('m.cheque_fecha_cobro', '>=', db.raw('current_date'))))
        .select('m.id', 'm.tipo', 'm.medio', 'm.monto_centavos as monto', 'm.cheque_numero as chequeNumero', 'm.cheque_fecha_cobro as chequeFechaCobro', 'm.cheque_estado as estado',
          'b.nombre as banco', db.raw('coalesce(c.nombre, p.nombre) as contraparte'))
        .orderBy('m.cheque_fecha_cobro'),
    };
  });
  app.post<{ Params: { id: string }; Body: { estado?: string } }>('/cheques/:id/estado', async (req) => {
    const s = await requerir(db, req, 'cuentas', 2);
    const estado = req.body?.estado === 'cartera' ? 'cartera' : 'depositado';
    if (!uuidOk(req.params.id)) throw new NotFoundError('No encontramos ese cheque');
    await cambiarEstadoCheque(db, s.usuarioId, req.params.id, estado);
    return { data: { ok: true } };
  });
  app.post('/dinero', async (req, reply) => {
    const s = await requerir(db, req, 'cuentas', 2);
    return reply.code(201).send({ data: await crearMovimiento(db, s.usuarioId, movimientoDineroSchema.parse(req.body)) });
  });
  app.post<{ Params: { id: string } }>('/dinero/:id/anular', async (req) => {
    const s = await requerir(db, req, 'cuentas', 3);
    if (!uuidOk(req.params.id)) throw new NotFoundError('No encontramos ese movimiento');
    await anularMovimiento(db, s.usuarioId, req.params.id, anularSchema.parse(req.body).motivo);
    return { data: { ok: true } };
  });

  // ---------- Cuentas corrientes ----------
  app.get<{ Params: { de: string } }>('/cuentas/:de', async (req) => {
    await requerir(db, req, 'cuentas', 1);
    const de = req.params.de === 'proveedor' ? 'proveedor' : 'cliente';
    return { data: await saldos(db, de) };
  });
  app.get<{ Params: { de: string; id: string } }>('/cuentas/:de/:id', async (req) => {
    await requerir(db, req, 'cuentas', 1);
    const de = req.params.de === 'proveedor' ? 'proveedor' : 'cliente';
    const id = uuidOk(req.params.id);
    const quien = id && (await db(de === 'cliente' ? 'clientes' : 'proveedores').where({ id }).first('id', 'nombre'));
    if (!quien) throw new NotFoundError('No encontramos esa cuenta');
    return { data: { ...quien, movimientos: await cuentaCorriente(db, de, quien.id) } };
  });
}
