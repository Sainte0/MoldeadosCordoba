import type { FastifyInstance } from 'fastify';
import type { Knex } from 'knex';
import { db } from '../db.js';
import { matriz, requerirAlguno } from '../lib/auth.js';
import { buscar } from '../lib/buscar.js';

// Buscador principal: datos por nombre o número, en paralelo, solo de lo que el rol puede ver. 5 por tipo.
interface Resultado { tipo: string; id: string; titulo: string; detalle: string; ruta: string }
const n6 = (n: number) => String(n).padStart(6, '0');

export async function buscarRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { q?: string } }>('/buscar', async (req) => {
    const s = await requerirAlguno(db, req, (['ventas', 'compras', 'produccion', 'cuentas', 'proveedores', 'gastos'] as const).map((m) => [m, 1]));
    const q = req.query.q?.trim() ?? '';
    if (q.length < 2 && !/^\d+$/.test(q)) return { data: [] };
    const m = (await matriz(db))[s.rol];
    const tareas: Promise<Resultado[]>[] = [];
    const de = (cond: boolean, f: () => Knex.QueryBuilder, armar: (r: Record<string, unknown>) => Resultado) => {
      if (cond) tareas.push(f().limit(5).then((filas: Record<string, unknown>[]) => filas.map(armar)));
    };
    de(m.ventas >= 1 || m.cuentas >= 1, () => db('clientes as c').whereNull('c.deleted_at').modify(buscar(q, ['c.nombre', 'c.cuit', 'c.telefono'])).select('c.id', 'c.nombre', 'c.telefono'),
      (r) => ({ tipo: 'Cliente', id: String(r.id), titulo: String(r.nombre), detalle: String(r.telefono ?? ''), ruta: m.cuentas >= 1 ? `/cuentas/cliente/${r.id}` : `/clientes?q=${encodeURIComponent(String(r.nombre))}` }));
    de(m.proveedores >= 1, () => db('proveedores as p').whereNull('p.deleted_at').modify(buscar(q, ['p.nombre', 'p.cuit'])).select('p.id', 'p.nombre', 'p.cuit'),
      (r) => ({ tipo: 'Proveedor', id: String(r.id), titulo: String(r.nombre), detalle: String(r.cuit ?? ''), ruta: m.cuentas >= 1 ? `/cuentas/proveedor/${r.id}` : `/proveedores?q=${encodeURIComponent(String(r.nombre))}` }));
    de(m.ventas >= 1, () => db('ventas as v').join('clientes as c', 'c.id', 'v.cliente_id').modify(buscar(q, ['c.nombre', 'v.retira', 'v.patente'], 'v.numero')).orderBy('v.fecha', 'desc')
      .select('v.id', 'v.numero', 'v.fecha', 'c.nombre', 'v.anulado_at'),
      (r) => ({ tipo: 'Remito', id: String(r.id), titulo: `Remito ${n6(Number(r.numero))} · ${r.nombre}`, detalle: `${String(r.fecha)}${r.anulado_at ? ' · anulado' : ''}`, ruta: `/ventas/${r.numero}` }));
    de(m.compras >= 1, () => db('compras as c').join('proveedores as p', 'p.id', 'c.proveedor_id').modify(buscar(q, ['p.nombre', 'c.patente', 'c.nro_factura'], 'c.numero')).orderBy('c.fecha', 'desc')
      .select('c.id', 'c.numero', 'c.tipo', 'c.fecha', 'p.nombre'),
      (r) => ({ tipo: r.tipo === 'pesaje' ? 'Ticket de cartón' : 'Compra', id: String(r.id), titulo: `${r.tipo === 'pesaje' ? 'Ticket' : 'Compra'} ${n6(Number(r.numero))} · ${r.nombre}`, detalle: String(r.fecha), ruta: `/compras/${r.numero}` }));
    de(m.produccion >= 1, () => db('palets as pa').join('variantes as v', 'v.id', 'pa.variante_id').modify(buscar(q, ['v.codigo', 'pa.destino'], 'pa.numero')).orderBy('pa.numero', 'desc')
      .select('pa.id', 'pa.numero', 'v.codigo', 'pa.paquetes', 'pa.venta_id'),
      (r) => ({ tipo: 'Palet', id: String(r.id), titulo: `Palet ${n6(Number(r.numero))} · ${r.codigo}`, detalle: `${r.paquetes} paquetes${r.venta_id ? ' · vendido' : ''}`, ruta: `/palets/${r.numero}` }));
    de(m.produccion >= 1, () => db('partes as p').join('variantes as v', 'v.id', 'p.variante_id').join('maquinas as mq', 'mq.id', 'p.maquina_id').modify(buscar(q, ['v.codigo', 'mq.codigo'], 'p.numero')).orderBy('p.fecha', 'desc')
      .select('p.id', 'p.numero', 'p.fecha', 'v.codigo', 'mq.codigo as maquina'),
      (r) => ({ tipo: 'Parte', id: String(r.id), titulo: `Producción ${n6(Number(r.numero))} · ${r.maquina} ${r.codigo}`, detalle: String(r.fecha), ruta: `/produccion/${r.numero}` }));
    return { data: (await Promise.all(tareas)).flat() };
  });
}
