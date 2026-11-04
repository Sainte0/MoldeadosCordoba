import type { FastifyInstance } from 'fastify';
import { anularSchema, cajaSchema, categoriaGastoSchema, gastoSchema } from '@moldeados/shared';
import { db } from '../db.js';
import { buscar } from '../lib/buscar.js';
import { requerir, requerirAlguno } from '../lib/auth.js';
import { auditar } from '../lib/auditoria.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { anularGasto, crearGasto, saldoCaja, tablero } from './gastos.service.js';

const fechaOk = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
const uuidOk = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);
const MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FOTO = 4 * 1024 * 1024;

export async function gastosRoutes(app: FastifyInstance): Promise<void> {
  // ---------- Comprobantes ----------
  // La app achica la foto (≈1600 px JPEG) y la manda en base64; acá solo se valida tipo y tamaño.
  app.post('/archivos', { bodyLimit: 7 * 1024 * 1024 }, async (req, reply) => {
    const s = await requerir(db, req, 'gastos', 2);
    const b = req.body as { mime?: string; base64?: string } | null;
    if (!b?.mime || !MIMES.includes(b.mime) || typeof b.base64 !== 'string') throw new ValidationError('La foto tiene que ser JPG, PNG o WebP');
    const datos = Buffer.from(b.base64, 'base64');
    if (!datos.length || datos.length > MAX_FOTO) throw new ValidationError('La foto es muy pesada (máximo 4 MB)');
    const [a] = await db('archivos').insert({ mime: b.mime, datos, bytes: datos.length, usuario_id: s.usuarioId }).returning('id');
    return reply.code(201).send({ data: a });
  });
  app.get<{ Params: { id: string } }>('/archivos/:id', async (req, reply) => {
    await requerirAlguno(db, req, [['gastos', 1], ['tablero', 1], ['ventas', 1]]);
    const a = await db('archivos').where({ id: uuidOk(req.params.id) ?? null }).first('mime', 'datos');
    if (!a) throw new NotFoundError('No encontramos ese archivo');
    return reply.header('Content-Type', a.mime).header('Cache-Control', 'private, max-age=86400').send(a.datos);
  });

  // ---------- Categorías ----------
  app.get('/categorias-gasto', async (req) => {
    await requerirAlguno(db, req, [['gastos', 1], ['tablero', 1]]);
    return { data: await db('categorias_gasto').whereNull('deleted_at').orderBy(['orden', 'nombre']).select('id', 'nombre', 'activo') };
  });
  app.post('/categorias-gasto', async (req, reply) => {
    const s = await requerir(db, req, 'gastos', 3);
    const i = categoriaGastoSchema.parse(req.body);
    const [c] = await db('categorias_gasto').insert({ ...i, orden: 100 }).returning('id');
    await auditar(db, { usuarioId: s.usuarioId, accion: 'crear', entidad: 'categoria_gasto', entidadId: c.id, despues: i });
    return reply.code(201).send({ data: c });
  });
  app.put<{ Params: { id: string } }>('/categorias-gasto/:id', async (req) => {
    const s = await requerir(db, req, 'gastos', 3);
    const i = categoriaGastoSchema.parse(req.body);
    const n = await db('categorias_gasto').where({ id: uuidOk(req.params.id) ?? null }).whereNull('deleted_at').update({ ...i, updated_at: db.fn.now() });
    if (!n) throw new NotFoundError('No encontramos esa categoría');
    await auditar(db, { usuarioId: s.usuarioId, accion: 'editar', entidad: 'categoria_gasto', entidadId: req.params.id, despues: i });
    return { data: { ok: true } };
  });

  // ---------- Gastos ----------
  app.get<{ Querystring: { desde?: string; hasta?: string; categoriaId?: string; pagina?: string; q?: string } }>('/gastos', async (req) => {
    await requerir(db, req, 'gastos', 1);
    const q = req.query;
    return {
      data: await db('gastos as g').join('categorias_gasto as k', 'k.id', 'g.categoria_id').leftJoin('empleados as e', 'e.id', 'g.empleado_id').join('usuarios as u', 'u.id', 'g.usuario_id')
        .modify((qb) => {
          if (fechaOk(q.desde)) qb.where('g.fecha', '>=', q.desde!);
          if (fechaOk(q.hasta)) qb.where('g.fecha', '<=', q.hasta!);
          if (uuidOk(q.categoriaId)) qb.where('g.categoria_id', q.categoriaId!);
        })
        .modify(buscar(q.q, ['g.descripcion', 'k.nombre', 'e.nombre', 'g.nro_factura'], 'g.numero'))
        .select('g.id', 'g.numero', 'g.fecha', 'g.descripcion', 'g.monto_centavos as monto', 'g.medio', 'g.con_factura as conFactura', 'g.comprobante_id as comprobanteId',
          'g.anulado_at as anuladoAt', 'k.nombre as categoria', 'e.nombre as empleado', 'u.nombre as cargadoPor')
        .orderBy([{ column: 'g.fecha', order: 'desc' }, { column: 'g.numero', order: 'desc' }])
        .limit(50).offset(Math.max(0, Number(q.pagina) || 0) * 50),
    };
  });
  app.get<{ Params: { id: string } }>('/gastos/:id', async (req) => {
    await requerir(db, req, 'gastos', 1);
    const g = await db('gastos as g').join('categorias_gasto as k', 'k.id', 'g.categoria_id').leftJoin('empleados as e', 'e.id', 'g.empleado_id').leftJoin('bancos as b', 'b.id', 'g.banco_id')
      .join('usuarios as u', 'u.id', 'g.usuario_id').leftJoin('usuarios as ua', 'ua.id', 'g.anulado_por').where('g.id', uuidOk(req.params.id) ?? null)
      .first('g.id', 'g.numero', 'g.fecha', 'g.descripcion', 'g.monto_centavos as monto', 'g.medio', 'b.nombre as banco', 'g.con_factura as conFactura', 'g.nro_factura as nroFactura',
        'g.comprobante_id as comprobanteId', 'g.notas', 'g.created_at as cargadoAt', 'g.anulado_at as anuladoAt', 'g.motivo_anulacion as motivoAnulacion',
        'k.nombre as categoria', 'e.nombre as empleado', 'u.nombre as cargadoPor', 'ua.nombre as anuladoPor');
    if (!g) throw new NotFoundError('No encontramos ese gasto');
    return { data: g };
  });
  app.post('/gastos', async (req, reply) => {
    const s = await requerir(db, req, 'gastos', 2);
    return reply.code(201).send({ data: await crearGasto(db, s.usuarioId, gastoSchema.parse(req.body)) });
  });
  app.post<{ Params: { id: string } }>('/gastos/:id/anular', async (req) => {
    const s = await requerir(db, req, 'gastos', 3);
    if (!uuidOk(req.params.id)) throw new NotFoundError('No encontramos ese gasto');
    await anularGasto(db, s.usuarioId, req.params.id, anularSchema.parse(req.body).motivo);
    return { data: { ok: true } };
  });

  // ---------- Caja chica ----------
  app.get('/caja', async (req) => {
    await requerir(db, req, 'gastos', 1);
    const movimientos = await db('caja_movimientos as m').join('usuarios as u', 'u.id', 'm.usuario_id')
      .select('m.id', 'm.fecha', 'm.monto_centavos as monto', 'm.motivo', 'm.concepto', 'm.gasto_id as gastoId', 'm.created_at as cargadoAt', 'u.nombre as usuario')
      .orderBy([{ column: 'm.fecha', order: 'desc' }, { column: 'm.created_at', order: 'desc' }]).limit(100);
    return { data: { saldo: await saldoCaja(db), movimientos } };
  });
  app.post('/caja', async (req, reply) => {
    const s = await requerir(db, req, 'gastos', 3);
    const i = cajaSchema.parse(req.body);
    const id = await db.transaction(async (trx) => {
      const [m] = await trx('caja_movimientos').insert({ fecha: i.fecha, monto_centavos: i.monto, motivo: i.motivo, concepto: i.concepto, usuario_id: s.usuarioId }).returning('id');
      await auditar(trx, { usuarioId: s.usuarioId, accion: 'crear', entidad: 'caja', entidadId: m.id, despues: i });
      return m.id;
    });
    return reply.code(201).send({ data: { id } });
  });

  // ---------- Tablero ----------
  app.get<{ Querystring: { desde?: string; hasta?: string } }>('/tablero', async (req) => {
    await requerir(db, req, 'tablero', 1);
    const desde = fechaOk(req.query.desde), hasta = fechaOk(req.query.hasta);
    if (!desde || !hasta || desde > hasta) throw new ValidationError('Elegí un período válido');
    if ((Date.parse(hasta) - Date.parse(desde)) / 86_400_000 > 800) throw new ValidationError('El período puede ser de hasta dos años');
    return { data: await tablero(db, desde, hasta) };
  });
}
