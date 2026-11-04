import type { FastifyInstance } from 'fastify';
import { ajusteStockSchema, materiaPrimaSchema } from '@moldeados/shared';
import { db } from '../db.js';
import { requerir } from '../lib/auth.js';
import { auditar } from '../lib/auditoria.js';
import { NotFoundError } from '../lib/errors.js';
import { consumoYDias, diasDeStock } from './avisos.service.js';

const COLS = ['id', 'nombre', 'tipo', 'unidad', 'color', 'stock_minimo as stockMinimo', 'dias_aviso as diasAviso', 'activo'];
const STOCK = db.raw('(select coalesce(sum(m.cantidad), 0)::bigint from movimientos_stock m where m.materia_prima_id = materias_primas.id) as stock');

export async function materiasRoutes(app: FastifyInstance): Promise<void> {
  app.get('/materias', async (req) => {
    // El pesaje y las compras necesitan la lista: alcanza con poder cargar compras o ver materia prima.
    await requerir(db, req, 'compras', 1).catch(() => requerir(db, req, 'materias', 1));
    const filas = await db('materias_primas').whereNull('deleted_at').select(COLS).select(STOCK).select(...consumoYDias(db)).orderBy([{ column: 'tipo' }, { column: 'nombre' }]);
    return { data: filas.map((m) => ({ ...m, dias: diasDeStock(Number(m.stock), Number(m.consumo30d)) })) };
  });

  app.get<{ Params: { id: string } }>('/materias/:id/movimientos', async (req) => {
    await requerir(db, req, 'materias', 1);
    const filas = await db('movimientos_stock as m')
      .join('usuarios as u', 'u.id', 'm.usuario_id')
      .leftJoin('compras as c', 'c.id', 'm.compra_id')
      .where('m.materia_prima_id', req.params.id)
      .select('m.id', 'm.cantidad', 'm.motivo', 'm.nota', 'm.created_at as fecha', 'u.nombre as usuario', 'c.numero as compraNumero', 'c.id as compraId')
      .orderBy('m.created_at', 'desc')
      .limit(100);
    return { data: filas };
  });

  app.post('/materias', async (req, reply) => {
    const s = await requerir(db, req, 'materias', 3);
    const i = materiaPrimaSchema.parse(req.body);
    const m = await db.transaction(async (trx) => {
      const [fila] = await trx('materias_primas').insert({ nombre: i.nombre, tipo: i.tipo, unidad: i.unidad, color: i.color, stock_minimo: i.stockMinimo, dias_aviso: i.diasAviso, activo: i.activo }).returning('id');
      await auditar(trx, { usuarioId: s.usuarioId, accion: 'crear', entidad: 'materia_prima', entidadId: fila.id, despues: i });
      return fila;
    });
    return reply.code(201).send({ data: m });
  });

  app.put<{ Params: { id: string } }>('/materias/:id', async (req) => {
    const s = await requerir(db, req, 'materias', 3);
    const i = materiaPrimaSchema.parse(req.body);
    return db.transaction(async (trx) => {
      const antes = await trx('materias_primas').where({ id: req.params.id }).whereNull('deleted_at').first(COLS);
      if (!antes) throw new NotFoundError('No encontramos esa materia prima');
      await trx('materias_primas').where({ id: antes.id }).update({ nombre: i.nombre, tipo: i.tipo, unidad: i.unidad, color: i.color, stock_minimo: i.stockMinimo, dias_aviso: i.diasAviso, activo: i.activo, updated_at: trx.fn.now() });
      await auditar(trx, { usuarioId: s.usuarioId, accion: 'editar', entidad: 'materia_prima', entidadId: antes.id, antes, despues: i });
      return { data: { id: antes.id } };
    });
  });

  app.post<{ Params: { id: string } }>('/materias/:id/ajuste', async (req) => {
    const s = await requerir(db, req, 'materias', 3);
    const { cantidad, nota } = ajusteStockSchema.parse(req.body);
    return db.transaction(async (trx) => {
      const m = await trx('materias_primas').where({ id: req.params.id }).whereNull('deleted_at').first('id');
      if (!m) throw new NotFoundError('No encontramos esa materia prima');
      const [mov] = await trx('movimientos_stock').insert({ materia_prima_id: m.id, cantidad, motivo: 'ajuste', nota, usuario_id: s.usuarioId }).returning('id');
      await auditar(trx, { usuarioId: s.usuarioId, accion: 'ajustar', entidad: 'materia_prima', entidadId: m.id, despues: { cantidad }, motivo: nota });
      return { data: mov };
    });
  });
}
