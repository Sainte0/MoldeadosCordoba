import type { FastifyInstance } from 'fastify';
import { db } from '../db.js';
import { requerir } from '../lib/auth.js';

export async function auditoriaRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { entidad?: string; entidadId?: string; antesDe?: string; usuarioId?: string; accion?: string; desde?: string; hasta?: string; q?: string } }>('/auditoria', async (req) => {
    await requerir(db, req, 'auditoria', 1);
    const { entidad, entidadId, antesDe, usuarioId, accion, desde, hasta, q } = req.query;
    const fecha = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
    const filas = await db('auditoria as a')
      .leftJoin('usuarios as u', 'u.id', 'a.usuario_id')
      .modify((qb) => {
        // "Qué": varias entidades separadas por coma (ej. venta,cobro).
        if (entidad) qb.whereIn('a.entidad', entidad.split(',').filter((x) => /^[a-z_]{2,30}$/.test(x)));
        if (entidadId && /^[0-9a-f-]{36}$/i.test(entidadId)) qb.where('a.entidad_id', entidadId);
        if (usuarioId && /^[0-9a-f-]{36}$/i.test(usuarioId)) qb.where('a.usuario_id', usuarioId);
        if (accion && /^[a-z]{3,10}$/.test(accion)) qb.where('a.accion', accion);
        // Días en hora argentina (la base está en -03:00).
        const d = fecha(desde), h = fecha(hasta);
        if (d) qb.whereRaw('a.created_at >= ?::date', [d]);
        if (h) qb.whereRaw('a.created_at < ?::date + 1', [h]);
        if (antesDe && !Number.isNaN(Date.parse(antesDe))) qb.where('a.created_at', '<', antesDe);
        // Buscar en el motivo y en lo que se guardó (nombre, concepto, monto, comprobante…), sin acentos.
        const t = q?.trim();
        if (t) qb.whereRaw("unaccent(coalesce(a.motivo, '') || ' ' || coalesce(a.despues::text, '') || ' ' || coalesce(a.antes::text, '')) ilike unaccent(?)", [`%${t.replace(/[%_\\]/g, '')}%`]);
      })
      .select('a.id', 'a.accion', 'a.entidad', 'a.entidad_id as entidadId', 'a.antes', 'a.despues', 'a.motivo', 'a.created_at as fecha', 'u.nombre as usuario')
      .orderBy('a.created_at', 'desc')
      .limit(50);
    return { data: filas };
  });
}
