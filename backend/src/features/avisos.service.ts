import type { Knex } from 'knex';
import { ritmoCliente } from '@moldeados/shared';

// Avisos que el sistema saca solo de lo que ya se carga: a quién llamar para vender, qué materia prima se está
// por acabar y cuánto cuesta hacer cada maple. Nada de esto se carga a mano.

/** Clientes a contactar: los que les toca comprar y los que dejaron. Se ocultan 7 días después de contactarlos. */
export async function recompra(db: Knex, hoy: string) {
  const filas: { id: string; nombre: string; telefono: string | null; contactado_at: Date | null; fechas: string[]; ultimo_total: number; ultimo_maples: number }[] = await db('clientes as c')
    .join('ventas as v', 'v.cliente_id', 'c.id')
    .whereNull('c.deleted_at').whereNull('v.anulado_at')
    .groupBy('c.id', 'c.nombre', 'c.telefono', 'c.contactado_at')
    .select('c.id', 'c.nombre', 'c.telefono', 'c.contactado_at',
      db.raw("array_agg(to_char(v.fecha, 'YYYY-MM-DD') order by v.fecha) as fechas"),
      db.raw('(array_agg(v.total_centavos order by v.fecha desc, v.numero desc))[1]::bigint as ultimo_total'),
      db.raw('(select coalesce(sum(i.maples), 0)::int from venta_items i where i.venta_id = (array_agg(v.id order by v.fecha desc, v.numero desc))[1]) as ultimo_maples'));
  const semana = Date.now() - 7 * 86_400_000;
  return filas
    .map((f) => ({ id: f.id, nombre: f.nombre, telefono: f.telefono, ultimoTotal: Number(f.ultimo_total), ultimoMaples: f.ultimo_maples, ultimaCompra: f.fechas.at(-1)!, ...ritmoCliente(f.fechas, hoy), contactado: f.contactado_at && +f.contactado_at > semana }))
    .filter((f) => f.estado !== 'al_dia' && !f.contactado)
    // Primero a los que les toca (venta casi segura); después los que dejaron, los más recientes primero.
    .sort((a, b) => (a.estado === b.estado ? (a.estado === 'le_toca' ? b.diasDesdeUltima - a.diasDesdeUltima : a.diasDesdeUltima - b.diasDesdeUltima) : a.estado === 'le_toca' ? -1 : 1))
    .map(({ contactado: _, ...f }) => f);
}

/** Consumo de los últimos 30 días y para cuántos días alcanza el stock de cada materia prima. */
export function consumoYDias(db: Knex) {
  return [
    db.raw(`coalesce((select sum(c.real) from parte_consumos c join partes p on p.id = c.parte_id
             where c.materia_prima_id = materias_primas.id and p.anulado_at is null and p.fecha > current_date - 30), 0)::bigint as "consumo30d"`),
  ];
}
export const diasDeStock = (stock: number, consumo30d: number) => (consumo30d > 0 ? Math.max(0, Math.floor(stock / (consumo30d / 30))) : null);

/** Materias primas que se acaban pronto (según el ritmo de consumo) o que están bajo el mínimo. */
export async function materiasPorAcabarse(db: Knex) {
  const filas = await db('materias_primas').whereNull('deleted_at').where({ activo: true })
    .select('id', 'nombre', 'unidad', 'stock_minimo as stockMinimo', 'dias_aviso as diasAviso',
      db.raw('(select coalesce(sum(m.cantidad), 0) from movimientos_stock m where m.materia_prima_id = materias_primas.id)::bigint as stock'), ...consumoYDias(db));
  return filas
    .map((m) => ({ ...m, stock: Number(m.stock), dias: diasDeStock(Number(m.stock), Number(m.consumo30d)) }))
    .filter((m) => (m.dias !== null && m.dias <= m.diasAviso) || (m.stockMinimo > 0 && m.stock < m.stockMinimo))
    .sort((a, b) => (a.dias ?? 999) - (b.dias ?? 999));
}

/**
 * Costo de materia prima por maple y margen. Costo de cada materia prima = promedio ponderado de lo comprado
 * (sin IVA) hasta la fecha. Costo por maple de un código = materia prima usada en sus partes de los últimos
 * 90 días ÷ maples hechos. Margen = precio de venta (sin IVA) − ese costo. No incluye gastos ni sueldos: es el
 * margen sobre la materia prima.
 */
export async function costosYMargen(db: Knex, desde: string, hasta: string) {
  const porCodigo = (await db.raw(
    `with costo_mp as (
       select i.materia_prima_id, sum(i.subtotal_centavos)::numeric / nullif(sum(i.cantidad), 0) as por_mili
       from compra_items i join compras c on c.id = i.compra_id
       where c.anulada_at is null and c.fecha <= :hasta group by i.materia_prima_id
     ),
     prod as (
       select p.variante_id, sum(p.paquetes * p.maples_por_paquete) as maples,
         sum((select coalesce(sum(pc.real * coalesce(cm.por_mili, 0)), 0) from parte_consumos pc left join costo_mp cm on cm.materia_prima_id = pc.materia_prima_id where pc.parte_id = p.id)) as costo,
         bool_or(exists (select 1 from parte_consumos pc left join costo_mp cm on cm.materia_prima_id = pc.materia_prima_id where pc.parte_id = p.id and pc.real > 0 and cm.por_mili is null)) as falta_precio
       from partes p where p.anulado_at is null and p.fecha between (:hasta::date - 90) and :hasta group by p.variante_id
     ),
     venta as (
       select i.variante_id, sum(i.maples) as maples, sum(i.subtotal_centavos) as neto
       from venta_items i join ventas v on v.id = i.venta_id
       where v.anulado_at is null and v.fecha between :desde and :hasta group by i.variante_id
     )
     select va.id, va.codigo, va.color_hex as "colorHex",
       case when prod.maples > 0 then round(prod.costo / prod.maples)::bigint end as "costoMaple",
       coalesce(prod.falta_precio, false) as "faltaPrecio",
       case when venta.maples > 0 then round(venta.neto::numeric / venta.maples)::bigint end as "precioMaple",
       coalesce(venta.maples, 0)::bigint as "maplesVendidos"
     from variantes va left join prod on prod.variante_id = va.id left join venta on venta.variante_id = va.id
     where va.deleted_at is null and (prod.maples > 0 or venta.maples > 0)
     order by va.codigo`,
    { desde, hasta },
  )).rows as { id: string; codigo: string; colorHex: string | null; costoMaple: number | null; faltaPrecio: boolean; precioMaple: number | null; maplesVendidos: number }[];

  const costo = new Map(porCodigo.map((c) => [c.id, c.costoMaple === null ? null : Number(c.costoMaple)]));
  const ventas = await db('venta_items as i').join('ventas as v', 'v.id', 'i.venta_id').join('clientes as c', 'c.id', 'v.cliente_id')
    .whereNull('v.anulado_at').whereBetween('v.fecha', [desde, hasta])
    .select('c.id', 'c.nombre', 'i.variante_id', 'i.maples', 'i.subtotal_centavos');
  const porCliente = new Map<string, { id: string; nombre: string; neto: number; costo: number; sinCosto: boolean }>();
  for (const v of ventas) {
    const f = porCliente.get(v.id) ?? { id: v.id, nombre: v.nombre, neto: 0, costo: 0, sinCosto: false };
    const c = costo.get(v.variante_id);
    f.neto += Number(v.subtotal_centavos);
    if (c === null || c === undefined) f.sinCosto = true;
    else f.costo += c * v.maples;
    porCliente.set(v.id, f);
  }
  return {
    porCodigo: porCodigo.map((c) => ({ ...c, costoMaple: c.costoMaple === null ? null : Number(c.costoMaple), precioMaple: c.precioMaple === null ? null : Number(c.precioMaple), maplesVendidos: Number(c.maplesVendidos) })),
    porCliente: [...porCliente.values()].map((f) => ({ ...f, margen: f.neto - f.costo })).sort((a, b) => b.margen - a.margen),
  };
}
