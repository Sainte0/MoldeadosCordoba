import type { FastifyInstance } from 'fastify';
import { anularSchema, empleadoSchema, empresaSchema, maquinaSchema, paletSchema, parteSchema, varianteSchema, type Rol } from '@moldeados/shared';
import { db } from '../db.js';
import { matriz, requerir, requerirAlguno, sesion } from '../lib/auth.js';
import { auditar } from '../lib/auditoria.js';
import { ConflictError, NotFoundError, UnauthorizedError } from '../lib/errors.js';
import { anularPalet, anularParte, crearPalet, crearParte, stockMaples, trazabilidad } from './produccion.service.js';

// Máquinas, códigos de maple (variantes) con receta, personal de planta, partes, palets y datos de la empresa.
// ponytail: los CRUD chicos van con la query en la ruta; la lógica con reglas vive en produccion.service.

const fechaOk = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
const uuidOk = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);
const COLS_VARIANTE = ['v.id', 'v.codigo', 'v.nombre', 'v.tamano', 'v.color', 'v.color_hex as colorHex', 'v.maquina_id as maquinaId', 'v.maples_por_paquete as maplesPorPaquete', 'v.maples_por_hora as maplesPorHora', 'v.activo', 'm.codigo as maquina'];

export async function produccionRoutes(app: FastifyInstance): Promise<void> {
  // ---------- Empresa ----------
  app.get('/empresa', async (req) => {
    sesion(req);
    return { data: await db('empresa').first('razon_social as razonSocial', 'direccion', 'telefono', 'email', 'cuit') };
  });
  app.put('/empresa', async (req) => {
    const s = await requerir(db, req, 'usuarios', 3);
    const i = empresaSchema.parse(req.body);
    await db.transaction(async (trx) => {
      const antes = await trx('empresa').first();
      await trx('empresa').where({ id: 1 }).update({ razon_social: i.razonSocial, direccion: i.direccion, telefono: i.telefono, email: i.email, cuit: i.cuit, updated_at: trx.fn.now() });
      await auditar(trx, { usuarioId: s.usuarioId, accion: 'editar', entidad: 'empresa', antes, despues: i });
    });
    return { data: { ok: true } };
  });

  // ---------- Máquinas ----------
  app.get('/maquinas', async (req) => {
    await requerirAlguno(db, req, [['produccion', 1], ['productos', 1]]);
    return { data: await db('maquinas').whereNull('deleted_at').orderBy('codigo').select('id', 'codigo', 'nombre', 'activo') };
  });
  app.post('/maquinas', async (req, reply) => {
    const s = await requerir(db, req, 'productos', 3);
    const i = maquinaSchema.parse(req.body);
    const [m] = await db.transaction(async (trx) => {
      const r = await trx('maquinas').insert(i).returning(['id']);
      await auditar(trx, { usuarioId: s.usuarioId, accion: 'crear', entidad: 'maquina', entidadId: r[0].id, despues: i });
      return r;
    });
    return reply.code(201).send({ data: m });
  });
  app.put<{ Params: { id: string } }>('/maquinas/:id', async (req) => {
    const s = await requerir(db, req, 'productos', 3);
    const i = maquinaSchema.parse(req.body);
    return db.transaction(async (trx) => {
      const antes = await trx('maquinas').where({ id: uuidOk(req.params.id) ?? null }).whereNull('deleted_at').first('codigo', 'nombre', 'activo');
      if (!antes) throw new NotFoundError('No encontramos esa máquina');
      await trx('maquinas').where({ id: req.params.id }).update({ ...i, updated_at: trx.fn.now() });
      await auditar(trx, { usuarioId: s.usuarioId, accion: 'editar', entidad: 'maquina', entidadId: req.params.id, antes, despues: i });
      return { data: { ok: true } };
    });
  });

  // ---------- Códigos de maple ----------
  app.get('/variantes', async (req) => {
    await requerirAlguno(db, req, [['produccion', 1], ['productos', 1]]);
    const variantes = await db('variantes as v').join('maquinas as m', 'm.id', 'v.maquina_id').whereNull('v.deleted_at').select(COLS_VARIANTE).orderBy('v.codigo');
    const receta = await db('receta_items as r').join('materias_primas as mp', 'mp.id', 'r.materia_prima_id')
      .whereIn('r.variante_id', variantes.map((v) => v.id))
      .select('r.variante_id', 'r.materia_prima_id as materiaPrimaId', 'r.cantidad_por_hora as cantidadPorHora', 'mp.nombre', 'mp.unidad');
    return { data: variantes.map((v) => ({ ...v, receta: receta.filter((r) => r.variante_id === v.id).map(({ variante_id: _, ...r }) => r) })) };
  });

  const guardarVariante = async (usuarioId: string, body: unknown, id?: string) => {
    const i = varianteSchema.parse(body);
    return db.transaction(async (trx) => {
      const fila = { codigo: i.codigo, nombre: i.nombre, tamano: i.tamano, color: i.color, color_hex: i.colorHex, maquina_id: i.maquinaId, maples_por_paquete: i.maplesPorPaquete, maples_por_hora: i.maplesPorHora, activo: i.activo };
      const repetido = await trx('variantes').whereRaw('lower(codigo) = lower(?)', [i.codigo]).whereNull('deleted_at').modify((q) => { if (id) q.whereNot({ id }); }).first('id');
      if (repetido) throw new ConflictError('Ya hay un maple con ese código');
      let varId = id;
      let antes = null;
      if (id) {
        antes = await trx('variantes').where({ id }).whereNull('deleted_at').first();
        if (!antes) throw new NotFoundError('No encontramos ese maple');
        await trx('variantes').where({ id }).update({ ...fila, updated_at: trx.fn.now() });
        await trx('receta_items').where({ variante_id: id }).delete();
      } else {
        varId = (await trx('variantes').insert(fila).returning('id'))[0].id;
      }
      if (i.receta.length) await trx('receta_items').insert(i.receta.map((r) => ({ variante_id: varId, materia_prima_id: r.materiaPrimaId, cantidad_por_hora: r.cantidadPorHora })));
      await auditar(trx, { usuarioId, accion: id ? 'editar' : 'crear', entidad: 'variante', entidadId: varId, antes, despues: i });
      return { id: varId };
    });
  };
  app.post('/variantes', async (req, reply) => {
    const s = await requerir(db, req, 'productos', 3);
    return reply.code(201).send({ data: await guardarVariante(s.usuarioId, req.body) });
  });
  app.put<{ Params: { id: string } }>('/variantes/:id', async (req) => {
    const s = await requerir(db, req, 'productos', 3);
    if (!uuidOk(req.params.id)) throw new NotFoundError('No encontramos ese maple');
    return { data: await guardarVariante(s.usuarioId, req.body, req.params.id) };
  });

  // ---------- Personal de planta ----------
  app.get('/empleados', async (req) => {
    await requerirAlguno(db, req, [['produccion', 1], ['usuarios', 1]]);
    return { data: await db('empleados').whereNull('deleted_at').orderBy('nombre').select('id', 'nombre', 'turno_habitual as turnoHabitual', 'activo') };
  });
  app.post('/empleados', async (req, reply) => {
    const s = await requerirAlguno(db, req, [['produccion', 3], ['usuarios', 3]]);
    const i = empleadoSchema.parse(req.body);
    const id = await db.transaction(async (trx) => {
      const [r] = await trx('empleados').insert({ nombre: i.nombre, turno_habitual: i.turnoHabitual, activo: i.activo }).returning('id');
      await auditar(trx, { usuarioId: s.usuarioId, accion: 'crear', entidad: 'empleado', entidadId: r.id, despues: i });
      return r.id;
    });
    return reply.code(201).send({ data: { id } });
  });
  app.put<{ Params: { id: string } }>('/empleados/:id', async (req) => {
    const s = await requerirAlguno(db, req, [['produccion', 3], ['usuarios', 3]]);
    const i = empleadoSchema.parse(req.body);
    return db.transaction(async (trx) => {
      const antes = await trx('empleados').where({ id: uuidOk(req.params.id) ?? null }).whereNull('deleted_at').first('nombre', 'turno_habitual', 'activo');
      if (!antes) throw new NotFoundError('No encontramos a esa persona');
      await trx('empleados').where({ id: req.params.id }).update({ nombre: i.nombre, turno_habitual: i.turnoHabitual, activo: i.activo, updated_at: trx.fn.now() });
      await auditar(trx, { usuarioId: s.usuarioId, accion: 'editar', entidad: 'empleado', entidadId: req.params.id, antes, despues: i });
      return { data: { ok: true } };
    });
  });

  // ---------- Partes de producción ----------
  app.get<{ Querystring: { desde?: string; hasta?: string; maquinaId?: string; pagina?: string } }>('/partes', async (req) => {
    await requerir(db, req, 'produccion', 1);
    const q = req.query;
    return {
      data: await db('partes as p')
        .join('variantes as v', 'v.id', 'p.variante_id').join('maquinas as m', 'm.id', 'p.maquina_id')
        .modify((qb) => {
          if (fechaOk(q.desde)) qb.where('p.fecha', '>=', q.desde!);
          if (fechaOk(q.hasta)) qb.where('p.fecha', '<=', q.hasta!);
          if (uuidOk(q.maquinaId)) qb.where('p.maquina_id', q.maquinaId!);
        })
        .select('p.id', 'p.numero', 'p.fecha', 'p.turno', 'p.minutos', 'p.paquetes', 'p.maples_por_hora as maplesPorHora', 'p.maples_por_paquete as maplesPorPaquete',
          'p.anulado_at as anuladoAt', 'v.codigo', 'v.nombre as variante', 'v.color_hex as colorHex', 'm.codigo as maquina')
        .orderBy([{ column: 'p.fecha', order: 'desc' }, { column: 'p.numero', order: 'desc' }])
        .limit(50).offset(Math.max(0, Number(q.pagina) || 0) * 50),
    };
  });

  // La planilla productiva: totales del período por máquina y variante, y consumo real vs. receta.
  app.get<{ Querystring: { desde?: string; hasta?: string } }>('/partes/resumen', async (req) => {
    await requerir(db, req, 'produccion', 1);
    const desde = fechaOk(req.query.desde), hasta = fechaOk(req.query.hasta);
    const filtro = (qb: import('knex').Knex.QueryBuilder) => {
      qb.whereNull('p.anulado_at');
      if (desde) qb.where('p.fecha', '>=', desde);
      if (hasta) qb.where('p.fecha', '<=', hasta);
    };
    const produccion = await db('partes as p').join('variantes as v', 'v.id', 'p.variante_id').join('maquinas as m', 'm.id', 'p.maquina_id').modify(filtro)
      .groupBy('m.codigo', 'v.id', 'v.codigo', 'v.nombre', 'v.color_hex')
      .select('m.codigo as maquina', 'v.codigo', 'v.nombre as variante', 'v.color_hex as colorHex',
        db.raw('count(*)::int as partes'), db.raw('sum(p.minutos)::int as minutos'), db.raw('sum(p.paquetes)::int as paquetes'), db.raw('sum(p.pulpeadas)::int as pulpeadas'),
        db.raw('sum(p.paquetes * p.maples_por_paquete)::bigint as maples'),
        db.raw('sum(case when p.maples_por_hora > 0 then floor(p.maples_por_hora * p.minutos / 60.0 / p.maples_por_paquete) end)::int as "paquetesTeoricos"'))
      .orderBy(['m.codigo', 'v.codigo']);
    const consumo = await db('parte_consumos as c').join('partes as p', 'p.id', 'c.parte_id').join('materias_primas as mp', 'mp.id', 'c.materia_prima_id').modify(filtro)
      .groupBy('mp.id', 'mp.nombre', 'mp.unidad').select('mp.nombre', 'mp.unidad', db.raw('sum(c.teorico)::bigint as teorico'), db.raw('sum(c.real)::bigint as real')).orderBy('mp.nombre');
    const porTurno = await db('partes as p').modify(filtro).groupBy('p.turno').select('p.turno', db.raw('sum(p.paquetes)::int as paquetes'), db.raw('sum(p.minutos)::int as minutos'));
    return { data: { produccion, consumo, porTurno } };
  });

  app.get<{ Params: { id: string } }>('/partes/:id', async (req) => {
    await requerir(db, req, 'produccion', 1);
    if (!uuidOk(req.params.id)) throw new NotFoundError('No encontramos ese parte');
    const p = await db('partes as p').join('variantes as v', 'v.id', 'p.variante_id').join('maquinas as m', 'm.id', 'p.maquina_id')
      .join('usuarios as u', 'u.id', 'p.usuario_id').leftJoin('usuarios as ua', 'ua.id', 'p.anulado_por').where('p.id', req.params.id)
      .first('p.id', 'p.numero', 'p.fecha', 'p.turno', 'p.minutos', 'p.pulpeadas', 'p.paquetes', 'p.maples_por_hora as maplesPorHora', 'p.maples_por_paquete as maplesPorPaquete',
        'p.notas', 'p.created_at as cargadoAt', 'p.anulado_at as anuladoAt', 'p.motivo_anulacion as motivoAnulacion', 'ua.nombre as anuladoPor', 'u.nombre as cargadoPor',
        'v.codigo', 'v.nombre as variante', 'v.color_hex as colorHex', 'm.codigo as maquina', 'm.nombre as maquinaNombre');
    if (!p) throw new NotFoundError('No encontramos ese parte');
    const [personal, consumos, palets] = await Promise.all([
      db('parte_empleados as pe').join('empleados as e', 'e.id', 'pe.empleado_id').where('pe.parte_id', p.id).orderBy('e.nombre').pluck('e.nombre'),
      db('parte_consumos as c').join('materias_primas as mp', 'mp.id', 'c.materia_prima_id').where('c.parte_id', p.id).select('mp.nombre', 'mp.unidad', 'c.teorico', 'c.real').orderBy('mp.nombre'),
      db('palet_lotes as l').join('palets as pa', 'pa.id', 'l.palet_id').where('l.parte_id', p.id).whereNull('pa.anulado_at').select('pa.id', 'pa.numero', 'l.paquetes'),
    ]);
    return { data: { ...p, personal, consumos, palets } };
  });

  app.post('/partes', async (req, reply) => {
    const s = await requerir(db, req, 'produccion', 2);
    return reply.code(201).send({ data: await crearParte(db, s.usuarioId, parteSchema.parse(req.body)) });
  });
  app.post<{ Params: { id: string } }>('/partes/:id/anular', async (req) => {
    const s = await requerir(db, req, 'produccion', 3);
    if (!uuidOk(req.params.id)) throw new NotFoundError('No encontramos ese parte');
    await anularParte(db, s.usuarioId, req.params.id, anularSchema.parse(req.body).motivo);
    return { data: { ok: true } };
  });

  // ---------- Stock de maples y palets ----------
  app.get('/stock-maples', async (req) => {
    await requerir(db, req, 'produccion', 1);
    return { data: await stockMaples(db) };
  });

  app.get<{ Querystring: { pagina?: string } }>('/palets', async (req) => {
    await requerir(db, req, 'produccion', 1);
    return {
      data: await db('palets as pa').join('variantes as v', 'v.id', 'pa.variante_id')
        .select('pa.id', 'pa.numero', 'pa.paquetes', 'pa.ancho', 'pa.largo', 'pa.alto', 'pa.vehiculo', 'pa.destino', 'pa.created_at as armadoAt', 'pa.anulado_at as anuladoAt',
          'v.codigo', 'v.nombre as variante', 'v.color_hex as colorHex', 'v.maples_por_paquete as maplesPorPaquete')
        .orderBy('pa.numero', 'desc').limit(50).offset(Math.max(0, Number(req.query.pagina) || 0) * 50),
    };
  });

  // Lo que se ve al escanear el QR. Cualquiera con usuario ve el palet; los lotes y el origen, según permisos.
  app.get<{ Params: { id: string } }>('/palets/:id', async (req) => {
    const s = sesion(req);
    const u = await db('usuarios').where({ id: s.usuarioId, activo: true }).whereNull('deleted_at').first('rol');
    if (!u) throw new UnauthorizedError();
    if (!uuidOk(req.params.id)) throw new NotFoundError('No encontramos ese palet');
    const t = await trazabilidad(db, req.params.id);
    const p = (await matriz(db))[u.rol as Rol];
    return { data: { ...t, lotes: p.produccion >= 1 ? t.lotes : null, origen: p.compras >= 1 ? t.origen : null } };
  });

  app.post('/palets', async (req, reply) => {
    const s = await requerir(db, req, 'produccion', 2);
    return reply.code(201).send({ data: await crearPalet(db, s.usuarioId, paletSchema.parse(req.body)) });
  });
  app.post<{ Params: { id: string } }>('/palets/:id/anular', async (req) => {
    const s = await requerir(db, req, 'produccion', 3);
    if (!uuidOk(req.params.id)) throw new NotFoundError('No encontramos ese palet');
    await anularPalet(db, s.usuarioId, req.params.id, anularSchema.parse(req.body).motivo);
    return { data: { ok: true } };
  });
}
