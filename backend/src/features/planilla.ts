import type { FastifyInstance } from 'fastify';
import type { Knex } from 'knex';
import { PALET_DEFAULT, planillaProduccionSchema, planillaVentaSchema, ventaSchema, type PlanillaProduccionInput, type PlanillaVentaInput } from '@moldeados/shared';
import { db } from '../db.js';
import { requerir, requerirAlguno } from '../lib/auth.js';
import { auditar } from '../lib/auditoria.js';
import { ConflictError, NotFoundError, ValidationError } from '../lib/errors.js';
import { armarPalet, insertarParte, lotesLibres } from './produccion.service.js';
import { crearVenta, preciosParaCliente } from './ventas.service.js';

// Planilla del día: la carga rápida para quien anota todo junto al final del día (lo que se fabricó, lo que se
// vendió/retiró y el cartón que entró). Usa la misma lógica que los asistentes, así stock, cuentas y tablero no cambian.
// Los palets se arman y desarman a medida: el stock se lleva en paquetes y el palet se arma recién al vender.

/** Paquetes por nivel de alto: ancho × largo, siempre iguales en la fábrica. */
export const PAQUETES_POR_NIVEL = PALET_DEFAULT.ancho * PALET_DEFAULT.largo;

/** Minutos entre comienzo y parada (HH:MM). Si la parada es "antes", pasó la medianoche. */
export function minutosEntre(inicio: string, fin: string): number {
  const m = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
  return (m(fin) - m(inicio) + 1440) % 1440;
}

export async function cargarProduccion(k: Knex, usuarioId: string, i: PlanillaProduccionInput) {
  const minutos = minutosEntre(i.inicio, i.fin);
  if (minutos === 0) throw new ValidationError('La parada tiene que ser distinta del comienzo');
  return k.transaction(async (trx) => {
    const v = await trx('variantes').where({ id: i.varianteId }).whereNull('deleted_at').first('maquina_id');
    if (!v) throw new ValidationError('Ese maple no existe');
    return insertarParte(trx, usuarioId, {
      fecha: i.fecha, turno: i.turno, maquinaId: v.maquina_id, varianteId: i.varianteId, empleadoIds: i.empleadoIds, minutos, pulpeadas: 0,
      paquetes: i.palets * i.alto * PAQUETES_POR_NIVEL, consumoReal: [], notas: `Planilla del día: ${i.palets} palets de alto ${i.alto} (${i.inicio} a ${i.fin})`,
    });
  });
}

/**
 * Venta desde la planilla: arma los palets a la medida con los paquetes libres más viejos y los vende. Si no alcanza
 * con lo libre, desarma palets ya armados (sin vender) de ese maple, como se hace en la fábrica; lo que sobra queda libre.
 */
export async function cargarVenta(k: Knex, usuarioId: string, i: PlanillaVentaInput) {
  return k.transaction(async (trx) => {
    const c = await trx('clientes').where({ id: i.clienteId }).whereNull('deleted_at').first('id', 'nombre');
    if (!c) throw new NotFoundError('No encontramos ese cliente');
    const v = await trx('variantes').where({ id: i.varianteId }).whereNull('deleted_at').forUpdate().first('id', 'codigo');
    if (!v) throw new ValidationError('Ese maple no existe');
    // Sin precio no se puede vender: en la planilla no se escribe el precio, se toma el del cliente o el de lista.
    if (!((await preciosParaCliente(trx, c.id)).get(v.id))) throw new ValidationError(`El ${v.codigo} no tiene precio. Cargalo en Ajustes › Precios (o el especial en la ficha del cliente).`);
    const porPalet = i.alto * PAQUETES_POR_NIVEL;
    const total = i.palets * porPalet;
    const libres = async () => ((await lotesLibres(trx, v.id)) as { libres: number }[]).reduce((a, l) => a + Math.max(0, l.libres), 0);

    let hay = await libres();
    if (hay < total) {
      // Desarmar palets armados que no se vendieron, del más nuevo al más viejo, hasta que alcance.
      const armados: { id: string; numero: number; paquetes: number }[] = await trx('palets').where({ variante_id: v.id, suelto: false })
        .whereNull('anulado_at').whereNull('venta_id').forUpdate().orderBy('numero', 'desc').select('id', 'numero', 'paquetes');
      for (const p of armados) {
        if (hay >= total) break;
        const motivo = `Desarmado para la entrega a ${c.nombre}`;
        await trx('palets').where({ id: p.id }).update({ anulado_at: trx.fn.now(), anulado_por: usuarioId, motivo_anulacion: motivo, updated_at: trx.fn.now() });
        await auditar(trx, { usuarioId, accion: 'anular', entidad: 'palet', entidadId: p.id, motivo });
        hay += p.paquetes;
      }
    }
    if (hay < total) {
      const enAlto = Math.floor(hay / PAQUETES_POR_NIVEL);
      throw new ConflictError(`Para ${i.palets} ${i.palets === 1 ? 'palet' : 'palets'} de alto ${i.alto} de ${v.codigo} hacen falta ${total} paquetes y en la fábrica hay ${hay} (${enAlto} de alto). Cargá primero lo fabricado.`);
    }

    const palets: string[] = [];
    for (let n = 0; n < i.palets; n++) {
      palets.push((await armarPalet(trx, usuarioId, { varianteId: v.id, ancho: PALET_DEFAULT.ancho, largo: PALET_DEFAULT.largo, alto: i.alto, vehiculo: null, destino: c.nombre, notas: 'Armado en la planilla del día' }, false)).id);
    }
    return crearVenta(trx, usuarioId, ventaSchema.parse({
      clienteId: c.id, fecha: i.fecha, conFactura: i.conFactura, ivaBp: 2100, retira: i.retira ?? c.nombre, palets, notas: 'Cargado en la planilla del día',
    }));
  });
}

/** Lo del día: fabricado, vendido/retirado, cartón que entró y lo que queda en la fábrica. */
export async function resumenDelDia(k: Knex, fecha: string) {
  const [produccion, ventas, carton, stock, cobros] = await Promise.all([
    k('partes as p').join('variantes as v', 'v.id', 'p.variante_id').join('maquinas as m', 'm.id', 'p.maquina_id')
      .where('p.fecha', fecha).whereNull('p.anulado_at').orderBy('p.numero')
      .select('p.id', 'p.numero', 'p.turno', 'p.minutos', 'p.paquetes', 'p.notas', 'v.codigo', 'v.color_hex as colorHex', 'm.codigo as maquina',
        k.raw('p.paquetes * v.maples_por_paquete as maples')),
    k('ventas as ve').join('clientes as c', 'c.id', 've.cliente_id').where('ve.fecha', fecha).whereNull('ve.anulado_at').orderBy('ve.numero')
      .select('ve.id', 've.numero', 'c.nombre as cliente', 've.total_centavos as total',
        k.raw("(select count(*) from palets pa where pa.venta_id = ve.id and not pa.suelto)::int as palets"),
        k.raw("(select string_agg(distinct va.codigo, ', ') from venta_items i join variantes va on va.id = i.variante_id where i.venta_id = ve.id) as codigos"),
        k.raw('(select coalesce(sum(i.maples), 0) from venta_items i where i.venta_id = ve.id)::int as maples')),
    k('compras as co').join('proveedores as pr', 'pr.id', 'co.proveedor_id').where('co.fecha', fecha).where('co.tipo', 'pesaje').whereNull('co.anulada_at').orderBy('co.numero')
      .select('co.id', 'co.numero', 'pr.nombre as proveedor', k.raw('(co.bruto_g - co.tara_g) as gramos'), 'co.total_centavos as total'),
    // En la fábrica = fabricado − vendido, en paquetes (armado o no, es lo mismo: se arma a medida).
    k('variantes as v').whereNull('v.deleted_at').where('v.activo', true).orderBy('v.codigo')
      .select('v.id', 'v.codigo', 'v.nombre', 'v.color_hex as colorHex',
        k.raw('(coalesce((select sum(p.paquetes) from partes p where p.variante_id = v.id and p.anulado_at is null), 0) - coalesce((select sum(pa.paquetes) from palets pa join ventas ve on ve.id = pa.venta_id where pa.variante_id = v.id and pa.anulado_at is null and ve.anulado_at is null), 0))::int as paquetes')),
    // Lo que entró de plata en el día (cobros a clientes).
    k('movimientos_dinero').where({ tipo: 'cobro', fecha }).whereNull('anulado_at').sum<{ s: string | null }>('monto_centavos as s').first(),
  ]);
  return { fecha, paquetesPorNivel: PAQUETES_POR_NIVEL, produccion, ventas, carton, stock, cobrado: Number(cobros?.s ?? 0) };
}

export async function planillaRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { fecha?: string } }>('/planilla', async (req) => {
    await requerirAlguno(db, req, [['produccion', 1], ['ventas', 1], ['compras', 1]]);
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(req.query.fecha ?? '') ? req.query.fecha! : hoy;
    return { data: await resumenDelDia(db, fecha) };
  });
  app.post('/planilla/produccion', async (req, reply) => {
    const s = await requerir(db, req, 'produccion', 2);
    return reply.code(201).send({ data: await cargarProduccion(db, s.usuarioId, planillaProduccionSchema.parse(req.body)) });
  });
  app.post('/planilla/venta', async (req, reply) => {
    const s = await requerir(db, req, 'ventas', 2);
    return reply.code(201).send({ data: await cargarVenta(db, s.usuarioId, planillaVentaSchema.parse(req.body)) });
  });
}
