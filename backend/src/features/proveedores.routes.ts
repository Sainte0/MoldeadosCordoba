import type { FastifyInstance } from 'fastify';
import { proveedorSchema, TIPOS_MP } from '@moldeados/shared';
import { db } from '../db.js';
import { buscar } from '../lib/buscar.js';
import { requerir } from '../lib/auth.js';
import { auditar } from '../lib/auditoria.js';
import { NotFoundError } from '../lib/errors.js';

const COLS = ['id', 'nombre', 'cuit', 'telefono', 'email', 'direccion', 'tipos', 'notas'] as const;

function aFila(i: ReturnType<typeof proveedorSchema.parse>) {
  return { nombre: i.nombre, cuit: i.cuit, telefono: i.telefono, email: i.email, direccion: i.direccion, tipos: i.tipos, notas: i.notas };
}

export async function proveedoresRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { q?: string; tipo?: string } }>('/proveedores', async (req) => {
    await requerir(db, req, 'proveedores', 1);
    const { q, tipo } = req.query;
    const filas = await db('proveedores as p')
      .whereNull('p.deleted_at')
      .modify((qb) => {
        if (tipo && (TIPOS_MP as readonly string[]).includes(tipo)) qb.whereRaw('? = any(p.tipos)', [tipo]);
      })
      .modify(buscar(q, ['p.nombre', 'p.cuit', 'p.telefono']))
      .select(COLS.map((c) => `p.${c}`))
      .select(
        db.raw(`(select max(c.fecha) from compras c where c.proveedor_id = p.id and c.anulada_at is null) as "ultimaCompra"`),
        db.raw(`(select coalesce(sum(c.total_centavos), 0)::bigint from compras c where c.proveedor_id = p.id and c.anulada_at is null and c.fecha >= current_date - 30) as "comprado30d"`),
      )
      .orderBy('p.nombre')
      .limit(200);
    return { data: filas };
  });

  app.get<{ Params: { id: string } }>('/proveedores/:id', async (req) => {
    await requerir(db, req, 'proveedores', 1);
    const p = await db('proveedores').where({ id: req.params.id }).whereNull('deleted_at').first(COLS);
    if (!p) throw new NotFoundError('No encontramos ese proveedor');
    const totales = await db('compras')
      .where({ proveedor_id: p.id })
      .whereNull('anulada_at')
      .first(
        db.raw('count(*)::int as compras'),
        db.raw('coalesce(sum(total_centavos), 0)::bigint as total'),
        db.raw('coalesce(sum(total_centavos) filter (where con_factura), 0)::bigint as "conFactura"'),
        db.raw('coalesce(sum(total_centavos) filter (where not con_factura), 0)::bigint as "sinFactura"'),
      );
    return { data: { ...p, totales } };
  });

  app.post('/proveedores', async (req, reply) => {
    const s = await requerir(db, req, 'proveedores', 2);
    const input = proveedorSchema.parse(req.body);
    const p = await db.transaction(async (trx) => {
      const [fila] = await trx('proveedores').insert(aFila(input)).returning(COLS);
      await auditar(trx, { usuarioId: s.usuarioId, accion: 'crear', entidad: 'proveedor', entidadId: fila.id, despues: fila });
      return fila;
    });
    return reply.code(201).send({ data: p });
  });

  app.put<{ Params: { id: string } }>('/proveedores/:id', async (req) => {
    const s = await requerir(db, req, 'proveedores', 3);
    const input = proveedorSchema.parse(req.body);
    return db.transaction(async (trx) => {
      const antes = await trx('proveedores').where({ id: req.params.id }).whereNull('deleted_at').first(COLS);
      if (!antes) throw new NotFoundError('No encontramos ese proveedor');
      const [despues] = await trx('proveedores').where({ id: antes.id }).update({ ...aFila(input), updated_at: trx.fn.now() }).returning(COLS);
      await auditar(trx, { usuarioId: s.usuarioId, accion: 'editar', entidad: 'proveedor', entidadId: antes.id, antes, despues });
      return { data: despues };
    });
  });

  app.delete<{ Params: { id: string } }>('/proveedores/:id', async (req) => {
    const s = await requerir(db, req, 'proveedores', 3);
    return db.transaction(async (trx) => {
      const antes = await trx('proveedores').where({ id: req.params.id }).whereNull('deleted_at').first(COLS);
      if (!antes) throw new NotFoundError('No encontramos ese proveedor');
      await trx('proveedores').where({ id: antes.id }).update({ deleted_at: trx.fn.now() });
      await auditar(trx, { usuarioId: s.usuarioId, accion: 'borrar', entidad: 'proveedor', entidadId: antes.id, antes });
      return { data: { ok: true } };
    });
  });
}
