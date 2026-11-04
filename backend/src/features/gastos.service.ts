import type { Knex } from 'knex';
import type { GastoInput } from '@moldeados/shared';
import { auditar } from '../lib/auditoria.js';
import { ConflictError, NotFoundError, ValidationError } from '../lib/errors.js';
import { costosYMargen } from './avisos.service.js';

// Gastos y caja chica. Un gasto pagado con caja chica descuenta la caja en la misma transacción.

export async function crearGasto(db: Knex, usuarioId: string, i: GastoInput): Promise<{ id: string; numero: number }> {
  return db.transaction(async (trx) => {
    if (!(await trx('categorias_gasto').where({ id: i.categoriaId }).whereNull('deleted_at').first('id'))) throw new ValidationError('Esa categoría no existe');
    if (i.empleadoId && !(await trx('empleados').where({ id: i.empleadoId }).whereNull('deleted_at').first('id'))) throw new ValidationError('Esa persona no está en el personal');
    if (i.comprobanteId && !(await trx('archivos').where({ id: i.comprobanteId }).first('id'))) throw new ValidationError('No encontramos la foto del comprobante; volvé a sacarla');
    // Pendiente: se registra ahora (cuenta en el mes) y la forma de pago se elige al pagarlo.
    const medio = i.aPagar ? null : i.medio;
    if ((medio === 'echeq' || medio === 'cheque') && !i.bancoId) throw new ValidationError('Elegí el banco del cheque');
    const [g] = await trx('gastos').insert({
      fecha: i.fecha, categoria_id: i.categoriaId, descripcion: i.descripcion, monto_centavos: i.monto, medio,
      banco_id: !medio || medio === 'efectivo' || medio === 'caja_chica' || medio === 'mercado_pago' ? null : i.bancoId,
      con_factura: i.conFactura, nro_factura: i.conFactura ? i.nroFactura : null, empleado_id: i.empleadoId, comprobante_id: i.comprobanteId, notas: i.notas, usuario_id: usuarioId,
      beneficiario: i.beneficiario, a_pagar: i.aPagar, vencimiento: i.aPagar ? i.vencimiento : null, monto_usd_centavos: i.montoUsd,
    }).returning(['id', 'numero']);
    if (medio === 'caja_chica') {
      await trx('caja_movimientos').insert({ fecha: i.fecha, monto_centavos: -i.monto, motivo: 'gasto', concepto: i.descripcion, gasto_id: g.id, usuario_id: usuarioId });
    }
    await auditar(trx, { usuarioId, accion: 'crear', entidad: 'gasto', entidadId: g.id, despues: i });
    return g;
  });
}

/** Marca pagado un egreso pendiente, con la forma de pago. Si sale de la caja chica, se descuenta de la caja. */
export async function pagarGasto(db: Knex, usuarioId: string, id: string, i: { medio: GastoInput['medio']; bancoId: string | null }): Promise<void> {
  await db.transaction(async (trx) => {
    const g = await trx('gastos').where({ id }).forUpdate().first('id', 'a_pagar', 'anulado_at', 'monto_centavos', 'descripcion');
    if (!g) throw new NotFoundError('No encontramos ese egreso');
    if (g.anulado_at) throw new ConflictError('Este egreso está anulado');
    if (!g.a_pagar) throw new ConflictError('Este egreso ya figura como pagado');
    if ((i.medio === 'echeq' || i.medio === 'cheque') && !i.bancoId) throw new ValidationError('Elegí el banco del cheque');
    await trx('gastos').where({ id }).update({ a_pagar: false, medio: i.medio, banco_id: i.medio === 'efectivo' || i.medio === 'caja_chica' || i.medio === 'mercado_pago' ? null : i.bancoId,
      pagado_at: trx.fn.now(), pagado_por: usuarioId, updated_at: trx.fn.now() });
    if (i.medio === 'caja_chica') {
      await trx('caja_movimientos').insert({ fecha: trx.raw('current_date'), monto_centavos: -g.monto_centavos, motivo: 'gasto', concepto: g.descripcion, gasto_id: id, usuario_id: usuarioId });
    }
    await auditar(trx, { usuarioId, accion: 'editar', entidad: 'gasto', entidadId: id, antes: { aPagar: true }, despues: { pagado: i } });
  });
}

export async function anularGasto(db: Knex, usuarioId: string, id: string, motivo: string): Promise<void> {
  await db.transaction(async (trx) => {
    const g = await trx('gastos').where({ id }).forUpdate().first('id', 'anulado_at', 'medio', 'monto_centavos', 'descripcion');
    if (!g) throw new NotFoundError('No encontramos ese gasto');
    if (g.anulado_at) throw new ConflictError('Este gasto ya estaba anulado');
    await trx('gastos').where({ id }).update({ anulado_at: trx.fn.now(), anulado_por: usuarioId, motivo_anulacion: motivo, updated_at: trx.fn.now() });
    if (g.medio === 'caja_chica') {
      await trx('caja_movimientos').insert({ fecha: trx.raw('current_date'), monto_centavos: g.monto_centavos, motivo: 'anulacion_gasto', concepto: `Anulado: ${g.descripcion}`, gasto_id: id, usuario_id: usuarioId });
    }
    await auditar(trx, { usuarioId, accion: 'anular', entidad: 'gasto', entidadId: id, motivo });
  });
}

export async function saldoCaja(db: Knex): Promise<number> {
  const r = await db('caja_movimientos').sum<{ s: string | null }>('monto_centavos as s').first();
  return Number(r?.s ?? 0);
}

/**
 * Todo lo del tablero para un período. Fechas inclusive, 'YYYY-MM-DD'.
 * "Resultado" es ventas − compras − gastos del período (lo facturado y lo no facturado, sin IVA separado):
 * es la foto del dueño, no un balance contable.
 */
export async function tablero(db: Knex, desde: string, hasta: string) {
  const enRango = (col: string) => (q: Knex.QueryBuilder) => q.whereBetween(col, [desde, hasta]);

  const [ventas, compras, gastos, cobros, pagos] = await Promise.all([
    db('ventas as v').whereNull('v.anulado_at').modify(enRango('v.fecha')).first(
      db.raw('coalesce(sum(v.total_centavos), 0)::bigint as total'), db.raw('coalesce(sum(v.total_centavos) filter (where v.con_factura), 0)::bigint as "conFactura"'),
      db.raw('count(*)::int as cantidad'), db.raw('coalesce((select sum(i.maples) from venta_items i join ventas x on x.id = i.venta_id where x.anulado_at is null and x.fecha between ? and ?), 0)::bigint as maples', [desde, hasta])),
    db('compras as c').whereNull('c.anulada_at').modify(enRango('c.fecha')).first(
      db.raw('coalesce(sum(c.total_centavos), 0)::bigint as total'), db.raw('coalesce(sum(c.total_centavos) filter (where c.con_factura), 0)::bigint as "conFactura"')),
    db('gastos as g').whereNull('g.anulado_at').modify(enRango('g.fecha')).first(db.raw('coalesce(sum(g.monto_centavos), 0)::bigint as total')),
    db('movimientos_dinero').whereNull('anulado_at').where({ tipo: 'cobro' }).modify(enRango('fecha')).first(db.raw('coalesce(sum(monto_centavos), 0)::bigint as total')),
    db('movimientos_dinero').whereNull('anulado_at').where({ tipo: 'pago' }).modify(enRango('fecha')).first(db.raw('coalesce(sum(monto_centavos), 0)::bigint as total')),
  ]);

  const [porCliente, porProveedor, porCategoria, produccion, consumo, porCalidad] = await Promise.all([
    db('ventas as v').join('clientes as c', 'c.id', 'v.cliente_id').whereNull('v.anulado_at').modify(enRango('v.fecha'))
      .groupBy('c.id', 'c.nombre').select('c.id', 'c.nombre', db.raw('sum(v.total_centavos)::bigint as total')).orderBy('total', 'desc'),
    db('compras as c').join('proveedores as p', 'p.id', 'c.proveedor_id').whereNull('c.anulada_at').modify(enRango('c.fecha'))
      .groupBy('p.id', 'p.nombre').select('p.id', 'p.nombre', db.raw('sum(c.total_centavos)::bigint as total')).orderBy('total', 'desc'),
    db('gastos as g').join('categorias_gasto as k', 'k.id', 'g.categoria_id').whereNull('g.anulado_at').modify(enRango('g.fecha'))
      .groupBy('k.id', 'k.nombre').select('k.id', 'k.nombre', db.raw('sum(g.monto_centavos)::bigint as total')).orderBy('total', 'desc'),
    db('partes as p').join('variantes as v', 'v.id', 'p.variante_id').whereNull('p.anulado_at').modify(enRango('p.fecha'))
      .groupBy('v.id', 'v.codigo', 'v.color_hex').select('v.codigo', 'v.color_hex as colorHex', db.raw('sum(p.paquetes)::int as paquetes'), db.raw('sum(p.paquetes * p.maples_por_paquete)::bigint as maples'), db.raw('sum(p.minutos)::int as minutos'))
      .orderBy('maples', 'desc'),
    db('parte_consumos as c').join('partes as p', 'p.id', 'c.parte_id').join('materias_primas as m', 'm.id', 'c.materia_prima_id').whereNull('p.anulado_at').modify(enRango('p.fecha'))
      .groupBy('m.id', 'm.nombre', 'm.unidad').select('m.nombre', 'm.unidad', db.raw('coalesce(sum(c.real), 0)::bigint as real'), db.raw('coalesce(sum(c.teorico), 0)::bigint as teorico')).orderBy('m.nombre'),
    // Como "Desglose de ventas por calidad" de la planilla. Sin IVA no: es lo vendido (subtotales de cada renglón).
    db('venta_items as i').join('ventas as v', 'v.id', 'i.venta_id').whereNull('v.anulado_at').modify(enRango('v.fecha'))
      .groupBy('i.calidad').select('i.calidad', db.raw('sum(i.subtotal_centavos)::bigint as total'), db.raw('sum(i.maples)::bigint as maples')),
  ]);

  // Serie: por día hasta 45 días, si no por semana (lunes). Días/semanas sin movimiento van en cero.
  const paso = (Date.parse(hasta) - Date.parse(desde)) / 86_400_000 > 45 ? 'week' : 'day';
  // Se agrupa cada tabla una sola vez por período y se cruza con la lista de períodos (antes era una subconsulta
  // por día/semana: con un año de datos tardaba 4 veces más).
  const serie = await db.raw(
    `with periodos as (
       select generate_series(date_trunc(:paso, :desde::date), date_trunc(:paso, :hasta::date), ('1 ' || :paso)::interval)::date as inicio
     ),
     ing as (
       select date_trunc(:paso, fecha)::date as inicio, sum(total_centavos) as s from ventas
       where anulado_at is null and fecha between :desde and :hasta group by 1
     ),
     egr as (
       select date_trunc(:paso, fecha)::date as inicio, sum(m) as s from (
         select fecha, total_centavos as m from compras where anulada_at is null and fecha between :desde and :hasta
         union all
         select fecha, monto_centavos from gastos where anulado_at is null and fecha between :desde and :hasta
       ) x group by 1
     )
     select to_char(p.inicio, 'YYYY-MM-DD') as inicio, coalesce(ing.s, 0)::bigint as ingresos, coalesce(egr.s, 0)::bigint as egresos
     from periodos p left join ing using (inicio) left join egr using (inicio) order by p.inicio`,
    { paso, desde, hasta },
  );

  const [porCobrar, porPagar, caja, bajoMinimo, palets] = await Promise.all([
    db.raw(`select (coalesce((select sum(total_centavos) from ventas where anulado_at is null), 0) + coalesce((select sum(monto_centavos) from saldos_iniciales where cliente_id is not null and anulado_at is null), 0) - coalesce((select sum(monto_centavos) from movimientos_dinero where tipo = 'cobro' and anulado_at is null), 0))::bigint as s`),
    db.raw(`select (coalesce((select sum(total_centavos) from compras where anulada_at is null), 0) + coalesce((select sum(monto_centavos) from saldos_iniciales where proveedor_id is not null and anulado_at is null), 0) - coalesce((select sum(monto_centavos) from movimientos_dinero where tipo = 'pago' and anulado_at is null), 0))::bigint as s`),
    saldoCaja(db),
    db.raw(`select count(*)::int as n from materias_primas m where m.deleted_at is null and m.activo and m.stock_minimo > 0
            and (select coalesce(sum(cantidad), 0) from movimientos_stock s where s.materia_prima_id = m.id) < m.stock_minimo`),
    db('palets').whereNull('anulado_at').whereNull('venta_id').first(db.raw('count(*)::int as n'), db.raw('coalesce(sum(paquetes), 0)::int as paquetes')),
  ]);

  const n = (x: unknown) => Number(x ?? 0);
  return {
    desde, hasta, paso,
    ventas: { total: n(ventas?.total), conFactura: n(ventas?.conFactura), cantidad: n(ventas?.cantidad), maples: n(ventas?.maples) },
    compras: { total: n(compras?.total), conFactura: n(compras?.conFactura) },
    gastos: { total: n(gastos?.total) },
    cobros: n(cobros?.total), pagos: n(pagos?.total),
    resultado: n(ventas?.total) - n(compras?.total) - n(gastos?.total),
    porCliente, porProveedor, porCategoria, produccion, consumo,
    porCalidad: (porCalidad as { calidad: string; total: string; maples: string }[]).map((c) => ({ calidad: c.calidad as 'primera' | 'segunda', total: n(c.total), maples: n(c.maples) })),
    serie: serie.rows as { inicio: string; ingresos: number; egresos: number }[],
    porCobrar: n(porCobrar.rows[0]?.s), porPagar: n(porPagar.rows[0]?.s), caja,
    costos: await costosYMargen(db, desde, hasta),
    materiasBajoMinimo: n(bajoMinimo.rows[0]?.n), paletsListos: { cantidad: n(palets?.n), paquetes: n(palets?.paquetes) },
  };
}

/**
 * Balance mes por mes de un año, como "BALANCE — RESUMEN MENSUAL" de la planilla: total ingresos (ventas), total
 * egresos (compras de materia prima + egresos), resultado del mes, saldo acumulado y variación contra el mes anterior.
 * Suma también lo cobrado y los maples producidos y vendidos (su hoja de stock mensual).
 */
export async function balanceAnual(db: Knex, anio: number) {
  const { rows } = await db.raw<{ rows: Record<string, string>[] }>(`
    with meses as (select generate_series(1, 12) as mes),
    ing as (select extract(month from fecha)::int as mes, sum(total_centavos) as s from ventas where anulado_at is null and extract(year from fecha) = :anio group by 1),
    cob as (select extract(month from fecha)::int as mes, sum(monto_centavos) as s from movimientos_dinero where tipo = 'cobro' and anulado_at is null and extract(year from fecha) = :anio group by 1),
    com as (select extract(month from fecha)::int as mes, sum(total_centavos) as s from compras where anulada_at is null and extract(year from fecha) = :anio group by 1),
    gas as (select extract(month from fecha)::int as mes, sum(monto_centavos) as s from gastos where anulado_at is null and extract(year from fecha) = :anio group by 1),
    pro as (select extract(month from fecha)::int as mes, sum(paquetes * maples_por_paquete) as s from partes where anulado_at is null and extract(year from fecha) = :anio group by 1),
    ven as (select extract(month from v.fecha)::int as mes, sum(i.maples) as s from venta_items i join ventas v on v.id = i.venta_id where v.anulado_at is null and extract(year from v.fecha) = :anio group by 1)
    select m.mes, coalesce(ing.s, 0)::bigint as ingresos, coalesce(cob.s, 0)::bigint as cobrado, coalesce(com.s, 0)::bigint as compras, coalesce(gas.s, 0)::bigint as gastos,
      coalesce(pro.s, 0)::bigint as producidos, coalesce(ven.s, 0)::bigint as vendidos
    from meses m left join ing using (mes) left join cob using (mes) left join com using (mes) left join gas using (mes) left join pro using (mes) left join ven using (mes)
    order by m.mes`, { anio });
  let acumulado = 0;
  let anterior: number | null = null;
  return rows.map((r) => {
    const ingresos = Number(r.ingresos), egresos = Number(r.compras) + Number(r.gastos);
    const resultado = ingresos - egresos;
    acumulado += resultado;
    const hay = ingresos !== 0 || egresos !== 0;
    // Variación como en la planilla: contra el resultado del mes anterior (sobre su valor absoluto).
    const variacion = hay && anterior ? Math.round(((resultado - anterior) / Math.abs(anterior)) * 1000) / 10 : null;
    if (hay) anterior = resultado;
    return { mes: Number(r.mes), ingresos, cobrado: Number(r.cobrado), compras: Number(r.compras), gastos: Number(r.gastos), egresos, resultado, acumulado, variacion,
      maplesProducidos: Number(r.producidos), maplesVendidos: Number(r.vendidos) };
  });
}
