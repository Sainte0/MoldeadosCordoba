import type { FastifyInstance } from 'fastify';
import { procedimientoSchema } from '@moldeados/shared';
import { db } from '../db.js';
import { requerirAlguno, sesion } from '../lib/auth.js';
import { auditar } from '../lib/auditoria.js';
import { NotFoundError, UnauthorizedError } from '../lib/errors.js';

// Procedimientos de planta: los lee cualquiera con usuario; los escriben quien maneja el equipo o la producción.
const uuidOk = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);
const COLS = ['id', 'titulo', 'resumen', 'pasos', 'updated_at as actualizado'];

export async function ayudaRoutes(app: FastifyInstance): Promise<void> {
  app.get('/procedimientos', async (req) => {
    const s = sesion(req);
    if (!(await db('usuarios').where({ id: s.usuarioId, activo: true }).whereNull('deleted_at').first('id'))) throw new UnauthorizedError();
    return { data: await db('procedimientos').whereNull('deleted_at').orderBy(['orden', 'titulo']).select(COLS) };
  });
  app.post('/procedimientos', async (req, reply) => {
    const s = await requerirAlguno(db, req, [['usuarios', 3], ['produccion', 3]]);
    const i = procedimientoSchema.parse(req.body);
    const [p] = await db('procedimientos').insert({ ...i, orden: 100, usuario_id: s.usuarioId }).returning('id');
    await auditar(db, { usuarioId: s.usuarioId, accion: 'crear', entidad: 'procedimiento', entidadId: p.id, despues: i });
    return reply.code(201).send({ data: p });
  });
  app.put<{ Params: { id: string } }>('/procedimientos/:id', async (req) => {
    const s = await requerirAlguno(db, req, [['usuarios', 3], ['produccion', 3]]);
    const i = procedimientoSchema.parse(req.body);
    return db.transaction(async (trx) => {
      const antes = await trx('procedimientos').where({ id: uuidOk(req.params.id) ?? null }).whereNull('deleted_at').first(COLS);
      if (!antes) throw new NotFoundError('No encontramos ese procedimiento');
      await trx('procedimientos').where({ id: antes.id }).update({ ...i, usuario_id: s.usuarioId, updated_at: trx.fn.now() });
      await auditar(trx, { usuarioId: s.usuarioId, accion: 'editar', entidad: 'procedimiento', entidadId: antes.id, antes, despues: i });
      return { data: { ok: true } };
    });
  });
  app.delete<{ Params: { id: string } }>('/procedimientos/:id', async (req) => {
    const s = await requerirAlguno(db, req, [['usuarios', 3], ['produccion', 3]]);
    const n = await db('procedimientos').where({ id: uuidOk(req.params.id) ?? null }).whereNull('deleted_at').update({ deleted_at: db.fn.now() });
    if (!n) throw new NotFoundError('No encontramos ese procedimiento');
    await auditar(db, { usuarioId: s.usuarioId, accion: 'borrar', entidad: 'procedimiento', entidadId: req.params.id });
    return { data: { ok: true } };
  });
}
