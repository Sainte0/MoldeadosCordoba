import type { Knex } from 'knex';
import { CLIENTE_SIN_NOMBRE, estadoStock, formatPesos, ORDEN_NIVEL, ritmoCliente, type Nivel3, type Unidad } from '@moldeados/shared';

// Avisos que el sistema saca solo de lo que ya se carga: a quién llamar para vender, qué materia prima se está
// por acabar y cuánto cuesta hacer cada maple. Nada de esto se carga a mano.

/** Clientes a contactar: los que les toca comprar y los que dejaron. Se ocultan 7 días después de contactarlos. */
export async function recompra(db: Knex, hoy: string) {
  const filas: { id: string; nombre: string; telefono: string | null; contactado_at: Date | null; fechas: string[]; ultimo_total: number; ultimo_maples: number }[] = await db('clientes as c')
    .join('ventas as v', 'v.cliente_id', 'c.id')
    .whereNull('c.deleted_at').whereNull('v.anulado_at').whereNot('c.nombre', CLIENTE_SIN_NOMBRE)
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

/**
 * Suma a una consulta de materias_primas el consumo de los últimos 30 días ("consumo30d"). Una sola agrupación que
 * arranca de los partes del mes (índice por fecha), no una subconsulta por materia prima: con años de datos la
 * versión anterior recorría todos los consumos una vez por materia.
 */
// justificación: el resultado depende de las columnas que elija quien llama; cada uno tipa sus filas.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function conConsumo30d(db: Knex, q: Knex.QueryBuilder): Knex.QueryBuilder<any, any[]> {
  return q
    .leftJoin(
      db.raw(`(select c.materia_prima_id, sum(c.real) as total from partes p join parte_consumos c on c.parte_id = p.id
               where p.anulado_at is null and p.fecha > current_date - 30 group by c.materia_prima_id) as cons30`),
      'cons30.materia_prima_id', 'materias_primas.id',
    )
    .select(db.raw('coalesce(cons30.total, 0)::bigint as "consumo30d"'));
}
export const diasDeStock = (stock: number, consumo30d: number) => (consumo30d > 0 ? Math.max(0, Math.floor(stock / (consumo30d / 30))) : null);

/** Materias primas que se acaban pronto (según el ritmo de consumo) o que están bajo el mínimo. */
export async function materiasPorAcabarse(db: Knex) {
  const filas: { id: string; nombre: string; unidad: string; stockMinimo: number; diasAviso: number; stock: string; consumo30d: string }[] = await conConsumo30d(db, db('materias_primas').whereNull('materias_primas.deleted_at').where({ 'materias_primas.activo': true })
    .select('materias_primas.id', 'nombre', 'unidad', 'stock_minimo as stockMinimo', 'dias_aviso as diasAviso',
      db.raw('(select coalesce(sum(m.cantidad), 0) from movimientos_stock m where m.materia_prima_id = materias_primas.id)::bigint as stock')));
  return filas
    .map((m) => {
      const stock = Number(m.stock);
      const dias = diasDeStock(stock, Number(m.consumo30d));
      return { ...m, stock, dias, estado: estadoStock({ stock, unidad: m.unidad as Unidad, stockMinimo: Number(m.stockMinimo), dias, diasAviso: m.diasAviso }) };
    })
    .filter((m) => m.estado.nivel !== 'ok')
    .sort((a, b) => ORDEN_NIVEL[a.estado.nivel] - ORDEN_NIVEL[b.estado.nivel] || (a.dias ?? 999) - (b.dias ?? 999));
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

export interface Aviso { nivel: Nivel3; tipo: string; titulo: string; detalle: string; accion: { texto: string; ruta: string } }

/**
 * Todo lo que hay que atender, en un solo listado y por urgencia (lo rojo primero). Cada aviso dice qué pasa y
 * lleva a dónde se resuelve. Solo lo que el rol puede ver o hacer.
 */
export async function atencion(db: Knex, hoy: string, puede: (modulo: string) => boolean): Promise<Aviso[]> {
  const avisos: Aviso[] = [];
  if (puede('materias') || puede('compras')) {
    for (const m of await materiasPorAcabarse(db)) {
      const falta = m.stock < 0;
      avisos.push({ nivel: m.estado.nivel, tipo: 'materia', titulo: `${m.nombre}: ${m.estado.titulo.toLowerCase()}`, detalle: m.estado.detalle,
        accion: falta ? { texto: 'Revisar stock', ruta: '/materia-prima' } : { texto: 'Cargar compra', ruta: /cart/i.test(m.nombre) ? '/pesaje' : '/compras/nueva' } });
    }
  }
  if (puede('ventas')) {
    const pedidos = await db('pedidos as p').join('clientes as c', 'c.id', 'p.cliente_id').where('p.estado', 'abierto').where('p.fecha_entrega', '<=', hoy)
      .select('p.id', 'p.numero', 'p.fecha_entrega as dia', 'c.nombre').orderBy('p.fecha_entrega');
    for (const p of pedidos) {
      const atrasado = p.dia < hoy;
      avisos.push({ nivel: atrasado ? 'critico' : 'atencion', tipo: 'pedido', titulo: `Pedido de ${p.nombre} ${atrasado ? 'atrasado' : 'para hoy'}`,
        detalle: atrasado ? `Era para el ${p.dia.slice(8, 10)}/${p.dia.slice(5, 7)} y todavía no se entregó todo.` : 'Todavía no se despachó completo.',
        accion: { texto: 'Despachar', ruta: `/ventas/nueva?pedido=${p.id}` } });
    }
  }
  if (puede('cuentas')) {
    const cheques = await db('movimientos_dinero as m').leftJoin('clientes as c', 'c.id', 'm.cliente_id').leftJoin('proveedores as p', 'p.id', 'm.proveedor_id')
      .whereNull('m.anulado_at').whereIn('m.medio', ['cheque', 'echeq'])
      .where((w) => w.where((x) => x.where('m.tipo', 'pago').whereBetween('m.cheque_fecha_cobro', [hoy, db.raw("?::date + 1", [hoy])]))
        .orWhere((x) => x.where('m.cheque_estado', 'cartera').where('m.cheque_fecha_cobro', '<=', hoy)))
      .select('m.tipo', 'm.monto_centavos as monto', 'm.cheque_fecha_cobro as dia', db.raw('coalesce(c.nombre, p.nombre) as quien'));
    for (const c of cheques) {
      const pesos = (Number(c.monto) / 100).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
      avisos.push(c.tipo === 'pago'
        ? { nivel: c.dia === hoy ? 'critico' : 'atencion', tipo: 'cheque', titulo: `Se debita un cheque nuestro ${c.dia === hoy ? 'hoy' : 'mañana'}`, detalle: `${pesos} a ${c.quien}. Que haya fondos en la cuenta.`, accion: { texto: 'Ver cheques', ruta: '/cuentas' } }
        : { nivel: 'atencion', tipo: 'cheque', titulo: `Cheque de ${c.quien} para depositar`, detalle: `${pesos}, ya se puede cobrar.`, accion: { texto: 'Ver cheques', ruta: '/cuentas' } });
    }
  }
  if (puede('gastos')) {
    // Egresos pendientes que vencen en los próximos 3 días o ya vencieron (F-931, IVA, facturas).
    const pendientes = await db('gastos').where({ a_pagar: true }).whereNull('anulado_at').whereNotNull('vencimiento')
      .whereRaw('vencimiento <= ?::date + 3', [hoy]).orderBy('vencimiento').select('numero', 'descripcion', 'beneficiario', 'monto_centavos as monto', db.raw("to_char(vencimiento, 'YYYY-MM-DD') as vence"));
    for (const g of pendientes) {
      const vencido = g.vence < hoy;
      const [, m, d] = String(g.vence).split('-');
      avisos.push({ nivel: vencido || g.vence === hoy ? 'critico' : 'atencion', tipo: 'egreso',
        titulo: `${vencido ? 'Venció' : g.vence === hoy ? 'Vence hoy' : `Vence el ${d}/${m}`}: ${g.descripcion}`,
        detalle: `${formatPesos(Number(g.monto))}${g.beneficiario ? ` · ${g.beneficiario}` : ''}. Egreso pendiente de pago.`,
        accion: { texto: 'Ver pendientes', ruta: '/egresos?estado=pendientes' } });
    }
  }
  if (puede('produccion') || puede('productos')) {
    const { maquinasConService } = await import('./produccion.service.js');
    for (const m of (await maquinasConService(db)).filter((x) => x.activo && x.leTocaService)) {
      avisos.push({ nivel: m.servicePasado ? 'critico' : 'atencion', tipo: 'service', titulo: `${m.codigo}: ${m.servicePasado ? 'service vencido' : 'le toca service'}`,
        detalle: `${m.horasDesdeService} h trabajadas de ${m.serviceCadaHoras} h.`, accion: { texto: 'Registrar service', ruta: '/maples' } });
    }
  }
  return avisos.sort((a, b) => ORDEN_NIVEL[a.nivel] - ORDEN_NIVEL[b.nivel]);
}
