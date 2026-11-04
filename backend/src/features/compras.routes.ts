import type { FastifyInstance } from 'fastify';
import { anularSchema, compraSchema, pesajeSchema } from '@moldeados/shared';
import { db } from '../db.js';
import { requerir } from '../lib/auth.js';
import { NotFoundError } from '../lib/errors.js';
import { anularCompra, crearCompra, crearPesaje } from './compras.service.js';

const fechaOk = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
const uuidOk = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);

export async function comprasRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { desde?: string; hasta?: string; proveedorId?: string; tipo?: string; pagina?: string } }>('/compras', async (req) => {
    await requerir(db, req, 'compras', 1);
    const q = req.query;
    const pagina = Math.max(0, Number(q.pagina) || 0);
    const filas = await db('compras as c')
      .join('proveedores as p', 'p.id', 'c.proveedor_id')
      .join('usuarios as u', 'u.id', 'c.usuario_id')
      .modify((qb) => {
        if (fechaOk(q.desde)) qb.where('c.fecha', '>=', q.desde!);
        if (fechaOk(q.hasta)) qb.where('c.fecha', '<=', q.hasta!);
        if (uuidOk(q.proveedorId)) qb.where('c.proveedor_id', q.proveedorId!);
        if (q.tipo === 'pesaje' || q.tipo === 'compra') qb.where('c.tipo', q.tipo);
      })
      .select(
        'c.id', 'c.numero', 'c.tipo', 'c.fecha', 'c.con_factura as conFactura', 'c.total_centavos as total', 'c.anulada_at as anuladaAt',
        'p.nombre as proveedor', 'u.nombre as cargadoPor',
        db.raw(`(select string_agg(mp.nombre, ', ' order by mp.nombre) from compra_items i join materias_primas mp on mp.id = i.materia_prima_id where i.compra_id = c.id) as resumen`),
      )
      .orderBy([{ column: 'c.fecha', order: 'desc' }, { column: 'c.numero', order: 'desc' }])
      .limit(50)
      .offset(pagina * 50);
    return { data: filas };
  });

  app.get<{ Querystring: { proveedorId?: string; materiaPrimaId?: string } }>('/compras/ultimo-precio', async (req) => {
    await requerir(db, req, 'compras', 1);
    const { proveedorId, materiaPrimaId } = req.query;
    if (!uuidOk(proveedorId) || !uuidOk(materiaPrimaId)) return { data: null };
    const fila = await db('compra_items as i')
      .join('compras as c', 'c.id', 'i.compra_id')
      .where({ 'c.proveedor_id': proveedorId, 'i.materia_prima_id': materiaPrimaId })
      .whereNull('c.anulada_at')
      .orderBy('c.created_at', 'desc')
      .first('i.precio_unitario_centavos as precio');
    return { data: fila?.precio ?? null };
  });

  app.get<{ Params: { id: string } }>('/compras/:id', async (req) => {
    await requerir(db, req, 'compras', 1);
    if (!uuidOk(req.params.id)) throw new NotFoundError('No encontramos esa compra');
    const c = await db('compras as c')
      .join('proveedores as p', 'p.id', 'c.proveedor_id')
      .join('usuarios as u', 'u.id', 'c.usuario_id')
      .leftJoin('usuarios as ua', 'ua.id', 'c.anulada_por')
      .where('c.id', req.params.id)
      .first(
        'c.id', 'c.numero', 'c.tipo', 'c.fecha', 'c.con_factura as conFactura', 'c.nro_factura as nroFactura', 'c.iva_bp as ivaBp',
        'c.neto_centavos as neto', 'c.iva_centavos as iva', 'c.total_centavos as total', 'c.bruto_g as brutoG', 'c.tara_g as taraG',
        'c.patente', 'c.notas', 'c.created_at as cargadaAt', 'c.anulada_at as anuladaAt', 'c.motivo_anulacion as motivoAnulacion',
        'p.id as proveedorId', 'p.nombre as proveedor', 'p.cuit as proveedorCuit', 'u.nombre as cargadoPor', 'ua.nombre as anuladaPor',
      );
    if (!c) throw new NotFoundError('No encontramos esa compra');
    const items = await db('compra_items as i')
      .join('materias_primas as m', 'm.id', 'i.materia_prima_id')
      .where('i.compra_id', c.id)
      .select('i.id', 'm.nombre', 'm.unidad', 'i.cantidad', 'i.precio_unitario_centavos as precioUnitario', 'i.subtotal_centavos as subtotal');
    return { data: { ...c, items } };
  });

  app.post('/compras/pesaje', async (req, reply) => {
    const s = await requerir(db, req, 'compras', 2);
    return reply.code(201).send({ data: await crearPesaje(db, s.usuarioId, pesajeSchema.parse(req.body)) });
  });

  app.post('/compras', async (req, reply) => {
    const s = await requerir(db, req, 'compras', 2);
    return reply.code(201).send({ data: await crearCompra(db, s.usuarioId, compraSchema.parse(req.body)) });
  });

  app.post<{ Params: { id: string } }>('/compras/:id/anular', async (req) => {
    const s = await requerir(db, req, 'compras', 3);
    if (!uuidOk(req.params.id)) throw new NotFoundError('No encontramos esa compra');
    await anularCompra(db, s.usuarioId, req.params.id, anularSchema.parse(req.body).motivo);
    return { data: { ok: true } };
  });
}
