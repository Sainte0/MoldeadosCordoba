import type { FastifyInstance } from 'fastify';
import type { Knex } from 'knex';
import { LABEL_REPETIR, ocurrencias, recordatorioSchema, type RecordatorioInput, type Repeticion } from '@moldeados/shared';
import { db } from '../db.js';
import { matriz, usuarioActivo, type Sesion } from '../lib/auth.js';
import { auditar } from '../lib/auditoria.js';
import { ForbiddenError, NotFoundError } from '../lib/errors.js';
import { activos, avisar } from './avisos-vivo.js';

// Agenda: recordatorios para una persona, varias o todos. Cada uno ve los suyos (los que le asignaron, los "para
// todos" y los que creó); quien maneja el equipo puede ver los de todos. Lo marca hecho uno y vale para todos.

const uuidOk = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
const HORA_SIN_HORA = '08:00'; // los recordatorios "en el día" se avisan a esta hora
const DIAS_ATRASO = 30;

interface Rec { id: string; titulo: string; detalle: string | null; fecha: string; hora: string | null; repetir: Repeticion; paraTodos: boolean; creadoPor: string; creador: string }

const esJefe = async (s: Sesion) => (await matriz(db))[s.rol].usuarios >= 3;

/**
 * Recordatorios vigentes que ve esta persona, o todos si `todos`. Con `de` (solo el dueño): la agenda de esas
 * personas, o sea lo que ve cada una (lo suyo, lo que creó y lo de todo el equipo).
 */
function visibles(k: Knex, s: Sesion, todos: boolean, de: string[] = []) {
  const q = k('recordatorios as r').join('usuarios as u', 'u.id', 'r.creado_por').whereNull('r.deleted_at')
    .select('r.id', 'r.titulo', 'r.detalle', k.raw("to_char(r.fecha, 'YYYY-MM-DD') as fecha"), 'r.hora', 'r.repetir', 'r.para_todos as paraTodos', 'r.creado_por as creadoPor', 'u.nombre as creador');
  const quienes = todos ? de : [s.usuarioId];
  if (quienes.length) {
    q.where((w) => w.where('r.para_todos', true).orWhereIn('r.creado_por', quienes)
      .orWhereExists(k('recordatorio_usuarios as ru').whereRaw('ru.recordatorio_id = r.id').whereIn('ru.usuario_id', quienes)));
  }
  return q;
}

async function destinatarios(k: Knex, r: { id: string; para_todos?: boolean; paraTodos?: boolean }): Promise<string[]> {
  if (r.para_todos ?? r.paraTodos) return activos(k);
  return (await k('recordatorio_usuarios as ru').join('usuarios as u', 'u.id', 'ru.usuario_id')
    .where('ru.recordatorio_id', r.id).where('u.activo', true).whereNull('u.deleted_at').select('ru.usuario_id')).map((x) => x.usuario_id as string);
}

const cuando = (fecha: string, hora: string | null, repetir: Repeticion) => {
  const [a, m, d] = fecha.split('-');
  return `${repetir === 'no' ? `${d}/${m}/${a}` : `${LABEL_REPETIR[repetir]}, desde el ${d}/${m}`}${hora ? ` a las ${hora}` : ''}`;
};

async function guardar(s: Sesion, i: RecordatorioInput, id?: string) {
  return db.transaction(async (trx) => {
    const usuarios = i.paraTodos ? [] : [...new Set(i.usuarios)];
    if (usuarios.length) {
      const ok = await trx('usuarios').whereIn('id', usuarios).where({ activo: true }).whereNull('deleted_at').count<{ n: number }[]>('* as n');
      if (Number(ok[0]?.n) !== usuarios.length) throw new NotFoundError('Alguna de las personas elegidas ya no está en el equipo');
    }
    const fila = { titulo: i.titulo, detalle: i.detalle, fecha: i.fecha, hora: i.hora, repetir: i.repetir, para_todos: i.paraTodos };
    let recId = id;
    let antes: unknown;
    let antesUsuarios: string[] = [];
    if (id) {
      const a = await trx('recordatorios').where({ id }).whereNull('deleted_at').first();
      if (!a) throw new NotFoundError('No encontramos ese recordatorio');
      if (a.creado_por !== s.usuarioId && !(await esJefe(s))) throw new ForbiddenError('Solo lo puede cambiar quien lo creó');
      antes = a;
      antesUsuarios = a.para_todos ? await activos(trx) : (await trx('recordatorio_usuarios').where({ recordatorio_id: id }).select('usuario_id')).map((x) => x.usuario_id);
      // Si cambia cuándo, se vuelve a avisar en la fecha nueva.
      await trx('recordatorios').where({ id }).update({ ...fila, avisado_hasta: null, updated_at: trx.fn.now() });
      await trx('recordatorio_usuarios').where({ recordatorio_id: id }).delete();
    } else {
      const [r] = await trx('recordatorios').insert({ ...fila, creado_por: s.usuarioId }).returning('id');
      recId = r.id as string;
    }
    if (usuarios.length) await trx('recordatorio_usuarios').insert(usuarios.map((u) => ({ recordatorio_id: recId, usuario_id: u })));
    await auditar(trx, { usuarioId: s.usuarioId, accion: id ? 'editar' : 'crear', entidad: 'recordatorio', entidadId: recId, antes, despues: i });

    // Avisar a quienes se suman (no al que lo cargó, ni de nuevo a los que ya estaban).
    const ahora = i.paraTodos ? await activos(trx) : usuarios;
    const nuevos = ahora.filter((u) => u !== s.usuarioId && !antesUsuarios.includes(u));
    const quien = (await trx('usuarios').where({ id: s.usuarioId }).first('nombre'))?.nombre ?? '';
    await avisar(trx, nuevos, { tipo: 'agenda', titulo: `${quien} te agendó: ${i.titulo}`, detalle: cuando(i.fecha, i.hora, i.repetir), ruta: `/agenda?fecha=${i.fecha}` });
    return { id: recId };
  });
}

/**
 * Revisa qué recordatorios tocan ahora y les avisa a sus personas, una sola vez por fecha. Lo llama un timer cada
 * minuto. Hora y fecha salen de la base (que está en hora argentina), no del reloj del servidor.
 */
export async function revisarRecordatorios(k: Knex = db): Promise<number> {
  const { rows: [t] } = await k.raw<{ rows: { hoy: string; ahora: string }[] }>("select to_char(now(), 'YYYY-MM-DD') as hoy, to_char(now(), 'HH24:MI') as ahora");
  const { hoy, ahora } = t!;
  const candidatos = await k('recordatorios').whereNull('deleted_at').where('fecha', '<=', hoy)
    .where((w) => w.whereNull('avisado_hasta').orWhere('avisado_hasta', '<', hoy))
    .whereRaw('coalesce(hora, ?) <= ?', [HORA_SIN_HORA, ahora])
    .whereNotExists(k('recordatorio_hechos as h').whereRaw('h.recordatorio_id = recordatorios.id').where('h.fecha', hoy))
    .select('id', 'titulo', 'detalle', k.raw("to_char(fecha, 'YYYY-MM-DD') as fecha"), 'hora', 'repetir', 'para_todos');
  let n = 0;
  for (const r of candidatos) {
    if (!ocurrencias(r, hoy, hoy).length) continue;
    // Marca primero y solo avisa si ganó la marca: aunque corran dos revisiones juntas, sale un solo aviso.
    const ganada = await k('recordatorios').where({ id: r.id }).where((w) => w.whereNull('avisado_hasta').orWhere('avisado_hasta', '<', hoy)).update({ avisado_hasta: hoy });
    if (!ganada) continue;
    await avisar(k, await destinatarios(k, r), { tipo: 'recordatorio', titulo: r.titulo, detalle: r.detalle ?? (r.hora ? `Hoy a las ${r.hora}` : 'Para hoy'), ruta: `/agenda?fecha=${hoy}` });
    n++;
  }
  return n;
}

export async function agendaRoutes(app: FastifyInstance): Promise<void> {
  app.get('/agenda/personas', async (req) => {
    await usuarioActivo(db, req);
    return { data: await db('usuarios').where({ activo: true }).whereNull('deleted_at').orderBy('nombre').select('id', 'nombre', 'rol') };
  });

  // Lo que cae entre desde y hasta, más lo atrasado sin hacer de los últimos 30 días.
  app.get<{ Querystring: { desde?: string; hasta?: string; todos?: string; de?: string } }>('/agenda', async (req) => {
    const s = await usuarioActivo(db, req);
    const { rows: [t] } = await db.raw<{ rows: { hoy: string; atras: string }[] }>(`select to_char(now(), 'YYYY-MM-DD') as hoy, to_char(now() - interval '${DIAS_ATRASO} days', 'YYYY-MM-DD') as atras`);
    const iso = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
    const desde = iso(req.query.desde) ?? t!.hoy;
    const hasta = iso(req.query.hasta) ?? desde;
    const jefeVe = await esJefe(s);
    const de = jefeVe ? (req.query.de ?? '').split(',').filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 50) : [];
    // "de" = agenda de esas personas (solo quien maneja el equipo); "todos" = la de todo el equipo.
    const todos = jefeVe && (req.query.todos === '1' || de.length > 0);
    const recs: Rec[] = await visibles(db, s, todos, de);
    if (!recs.length) return { data: { hoy: t!.hoy, items: [] } };
    const ids = recs.map((r) => r.id);
    const [personas, hechos] = await Promise.all([
      db('recordatorio_usuarios as ru').join('usuarios as u', 'u.id', 'ru.usuario_id').whereIn('ru.recordatorio_id', ids).orderBy('u.nombre').select('ru.recordatorio_id as rid', 'u.id', 'u.nombre'),
      db('recordatorio_hechos as h').join('usuarios as u', 'u.id', 'h.usuario_id').whereIn('h.recordatorio_id', ids).where('h.fecha', '>=', t!.atras < desde ? t!.atras : desde).where('h.fecha', '<=', hasta)
        .select('h.recordatorio_id as rid', db.raw("to_char(h.fecha, 'YYYY-MM-DD') as fecha"), 'u.nombre as por', 'h.hecho_at as at'),
    ]);
    const jefe = await esJefe(s);
    const items = [];
    for (const r of recs) {
      const suyas = personas.filter((p) => p.rid === r.id).map((p) => ({ id: p.id, nombre: p.nombre }));
      const base = { id: r.id, titulo: r.titulo, detalle: r.detalle, hora: r.hora, repetir: r.repetir, paraTodos: r.paraTodos, creador: r.creador, personas: suyas, puedeEditar: r.creadoPor === s.usuarioId || jefe };
      const fechas = new Set(ocurrencias(r, desde, hasta));
      // Atrasados: fechas pasadas sin marcar hecho (solo se muestran si el rango incluye hoy).
      if (desde <= t!.hoy && hasta >= t!.hoy) for (const f of ocurrencias(r, t!.atras, t!.hoy)) if (f < t!.hoy) fechas.add(f);
      for (const fecha of fechas) {
        const h = hechos.find((x) => x.rid === r.id && x.fecha === fecha);
        if (fecha < desde && h) continue; // atrasado ya hecho: no se muestra
        items.push({ ...base, fecha, hecho: h ? { por: h.por, at: h.at } : null, atrasado: fecha < t!.hoy && !h });
      }
    }
    items.sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.hora ?? '99').localeCompare(b.hora ?? '99') || a.titulo.localeCompare(b.titulo));
    return { data: { hoy: t!.hoy, items } };
  });

  app.get<{ Params: { id: string } }>('/agenda/:id', async (req) => {
    const s = await usuarioActivo(db, req);
    const r = await visibles(db, s, await esJefe(s)).where('r.id', uuidOk(req.params.id)).first();
    if (!r) throw new NotFoundError('No encontramos ese recordatorio');
    const usuarios = (await db('recordatorio_usuarios').where({ recordatorio_id: r.id }).select('usuario_id')).map((x) => x.usuario_id);
    return { data: { ...r, usuarios } };
  });

  app.post('/agenda', async (req, reply) => {
    const s = await usuarioActivo(db, req);
    return reply.code(201).send({ data: await guardar(s, recordatorioSchema.parse(req.body)) });
  });

  app.put<{ Params: { id: string } }>('/agenda/:id', async (req) => {
    const s = await usuarioActivo(db, req);
    const id = uuidOk(req.params.id);
    if (!id) throw new NotFoundError('No encontramos ese recordatorio');
    return { data: await guardar(s, recordatorioSchema.parse(req.body), id) };
  });

  app.post<{ Params: { id: string }; Body: { fecha?: string; hecho?: boolean } }>('/agenda/:id/hecho', async (req) => {
    const s = await usuarioActivo(db, req);
    const fecha = typeof req.body?.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.body.fecha) ? req.body.fecha : null;
    const r = await visibles(db, s, await esJefe(s)).where('r.id', uuidOk(req.params.id)).first();
    if (!r || !fecha || !ocurrencias(r, fecha, fecha).length) throw new NotFoundError('No encontramos ese recordatorio');
    await db.transaction(async (trx) => {
      if (req.body?.hecho === false) {
        await trx('recordatorio_hechos').where({ recordatorio_id: r.id, fecha }).delete();
      } else {
        const [nuevo] = await trx('recordatorio_hechos').insert({ recordatorio_id: r.id, fecha, usuario_id: s.usuarioId }).onConflict(['recordatorio_id', 'fecha']).ignore().returning('recordatorio_id');
        if (nuevo && r.creadoPor !== s.usuarioId) {
          const quien = (await trx('usuarios').where({ id: s.usuarioId }).first('nombre'))?.nombre ?? '';
          await avisar(trx, [r.creadoPor], { tipo: 'agenda', titulo: `${quien} hizo: ${r.titulo}`, detalle: null, ruta: `/agenda?fecha=${fecha}` });
        }
      }
      await auditar(trx, { usuarioId: s.usuarioId, accion: 'editar', entidad: 'recordatorio', entidadId: r.id, despues: { fecha, hecho: req.body?.hecho !== false } });
    });
    return { data: { ok: true } };
  });

  app.delete<{ Params: { id: string } }>('/agenda/:id', async (req) => {
    const s = await usuarioActivo(db, req);
    const id = uuidOk(req.params.id);
    const a = id ? await db('recordatorios').where({ id }).whereNull('deleted_at').first() : null;
    if (!a) throw new NotFoundError('No encontramos ese recordatorio');
    if (a.creado_por !== s.usuarioId && !(await esJefe(s))) throw new ForbiddenError('Solo lo puede borrar quien lo creó');
    await db.transaction(async (trx) => {
      await trx('recordatorios').where({ id: a.id }).update({ deleted_at: trx.fn.now() });
      await auditar(trx, { usuarioId: s.usuarioId, accion: 'anular', entidad: 'recordatorio', entidadId: a.id, antes: a });
    });
    return { data: { ok: true } };
  });
}
