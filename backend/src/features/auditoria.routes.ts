import type { FastifyInstance } from 'fastify';
import { db } from '../db.js';
import { requerir } from '../lib/auth.js';

export async function auditoriaRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { entidad?: string; entidadId?: string; antesDe?: string } }>('/auditoria', async (req) => {
    await requerir(db, req, 'auditoria', 1);
    const { entidad, entidadId, antesDe } = req.query;
    const filas = await db('auditoria as a')
      .leftJoin('usuarios as u', 'u.id', 'a.usuario_id')
      .modify((q) => {
        if (entidad) q.where('a.entidad', entidad);
        if (entidadId && /^[0-9a-f-]{36}$/i.test(entidadId)) q.where('a.entidad_id', entidadId);
        if (antesDe && !Number.isNaN(Date.parse(antesDe))) q.where('a.created_at', '<', antesDe);
      })
      .select('a.id', 'a.accion', 'a.entidad', 'a.entidad_id as entidadId', 'a.antes', 'a.despues', 'a.motivo', 'a.created_at as fecha', 'u.nombre as usuario')
      .orderBy('a.created_at', 'desc')
      .limit(50);
    return { data: filas };
  });
}
