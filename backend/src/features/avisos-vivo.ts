import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Knex } from 'knex';
import webpush from 'web-push';
import { suscripcionSchema } from '@moldeados/shared';
import { db } from '../db.js';
import { env } from '../config/env.js';
import { usuarioActivo } from '../lib/auth.js';

// Avisos por persona (la campana). Cada aviso se guarda en la base, sale en vivo a las pantallas abiertas de esa
// persona (stream de eventos) y, si activó los avisos en su teléfono, llega como notificación aunque la app esté
// cerrada (Web Push; en iPhone hace falta tener la app agregada a la pantalla de inicio).
// ponytail: las conexiones en vivo viven en memoria del proceso; con más de una instancia de la API, pasar por
// LISTEN/NOTIFY de Postgres.

export interface NuevoAviso { tipo: string; titulo: string; detalle?: string | null; ruta?: string | null }

const enVivo = new Map<string, Set<FastifyReply>>();

const enviar = (r: FastifyReply, evento: string, datos: unknown) => r.raw.write(`event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`);

let claves: { publica: string; privada: string } | null = null;
/** Claves VAPID del servidor: se generan la primera vez y quedan en la base (sin configurar nada a mano). */
export async function clavesPush(k: Knex = db): Promise<{ publica: string; privada: string }> {
  if (claves) return claves;
  const e = await k('empresa').first('vapid_publica', 'vapid_privada');
  if (e?.vapid_publica && e.vapid_privada) claves = { publica: e.vapid_publica, privada: e.vapid_privada };
  else {
    const g = webpush.generateVAPIDKeys();
    await k('empresa').update({ vapid_publica: g.publicKey, vapid_privada: g.privateKey });
    claves = { publica: g.publicKey, privada: g.privateKey };
  }
  return claves;
}

async function alTelefono(usuarioIds: string[], a: NuevoAviso): Promise<void> {
  const subs = await db('push_suscripciones').whereIn('usuario_id', usuarioIds).select('id', 'endpoint', 'p256dh', 'auth');
  if (!subs.length) return;
  const c = await clavesPush();
  const cuerpo = JSON.stringify({ titulo: a.titulo, detalle: a.detalle ?? '', ruta: a.ruta ?? '/' });
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, cuerpo, {
        vapidDetails: { subject: 'mailto:sistema@moldeadoscordoba.com.ar', publicKey: c.publica, privateKey: c.privada },
        TTL: 60 * 60 * 12,
      });
    } catch (e) {
      // 404/410: el teléfono dio de baja la suscripción (desinstaló la app, borró datos). Se limpia.
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await db('push_suscripciones').where({ id: s.id }).delete();
    }
  }));
}

/**
 * Manda un aviso a esas personas. Se guarda con la transacción que se pase (si se anula el cambio, no queda aviso);
 * lo en vivo y el teléfono salen después, sin frenar a quien hizo la carga.
 */
export async function avisar(k: Knex, usuarioIds: string[], a: NuevoAviso): Promise<void> {
  const ids = [...new Set(usuarioIds)];
  if (!ids.length) return;
  const filas = await k('notificaciones')
    .insert(ids.map((u) => ({ usuario_id: u, tipo: a.tipo, titulo: a.titulo, detalle: a.detalle ?? null, ruta: a.ruta ?? null })))
    .returning(['id', 'usuario_id as usuarioId', 'tipo', 'titulo', 'detalle', 'ruta', 'created_at as creada']);
  const salir = () => {
    for (const f of filas) for (const r of enVivo.get(f.usuarioId) ?? []) enviar(r, 'aviso', f);
    if (process.env.NODE_ENV !== 'test') void alTelefono(ids, a).catch(() => {});
  };
  // Dentro de una transacción, recién sale cuando se confirma.
  if (k.isTransaction) (k as Knex.Transaction).executionPromise.then(salir, () => {});
  else salir();
}

/** Usuarios activos (para "todos") o los que tengan alguno de esos permisos. */
export async function activos(k: Knex, salvo?: string): Promise<string[]> {
  const q = k('usuarios').where({ activo: true }).whereNull('deleted_at');
  if (salvo) q.whereNot({ id: salvo });
  return (await q.select('id')).map((u) => u.id as string);
}

export async function avisosVivoRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { todas?: string } }>('/notificaciones', async (req) => {
    const s = await usuarioActivo(db, req);
    const [lista, sinLeer] = await Promise.all([
      db('notificaciones').where({ usuario_id: s.usuarioId }).orderBy('created_at', 'desc').limit(60)
        .select('id', 'tipo', 'titulo', 'detalle', 'ruta', 'leida_at as leida', 'created_at as creada'),
      db('notificaciones').where({ usuario_id: s.usuarioId }).whereNull('leida_at').count<{ n: number }[]>('* as n'),
    ]);
    return { data: { lista, sinLeer: Number(sinLeer[0]?.n ?? 0) } };
  });

  app.post<{ Body: { id?: string } }>('/notificaciones/leer', async (req) => {
    const s = await usuarioActivo(db, req);
    const q = db('notificaciones').where({ usuario_id: s.usuarioId }).whereNull('leida_at');
    const id = req.body?.id;
    if (typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)) q.where({ id });
    await q.update({ leida_at: db.fn.now() });
    return { data: { ok: true } };
  });

  // En vivo: stream de eventos. Se lee con fetch (lleva el token en la cabecera, no en la dirección).
  app.get('/notificaciones/vivo', async (req, reply) => {
    const s = await usuarioActivo(db, req);
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': env.APP_URL,
    });
    const set = enVivo.get(s.usuarioId) ?? new Set();
    set.add(reply);
    enVivo.set(s.usuarioId, set);
    enviar(reply, 'hola', { ok: true });
    // Latido: los proxys cortan conexiones mudas; esto también avisa enseguida si el teléfono se fue.
    const latido = setInterval(() => reply.raw.write(': ok\n\n'), 25_000);
    req.raw.on('close', () => {
      clearInterval(latido);
      set.delete(reply);
      if (!set.size) enVivo.delete(s.usuarioId);
    });
  });

  app.get('/push/clave', async (req) => {
    await usuarioActivo(db, req);
    return { data: { clave: (await clavesPush()).publica } };
  });

  app.post('/push/suscribir', async (req) => {
    const s = await usuarioActivo(db, req);
    const i = suscripcionSchema.parse(req.body);
    // Un teléfono = una suscripción; si otra persona entra en el mismo teléfono, pasa a ser de ella.
    await db('push_suscripciones').insert({ usuario_id: s.usuarioId, endpoint: i.endpoint, p256dh: i.keys.p256dh, auth: i.keys.auth })
      .onConflict('endpoint').merge(['usuario_id', 'p256dh', 'auth']);
    return { data: { ok: true } };
  });

  app.post<{ Body: { endpoint?: string } }>('/push/desuscribir', async (req) => {
    const s = await usuarioActivo(db, req);
    if (typeof req.body?.endpoint === 'string') await db('push_suscripciones').where({ usuario_id: s.usuarioId, endpoint: req.body.endpoint }).delete();
    return { data: { ok: true } };
  });
}
