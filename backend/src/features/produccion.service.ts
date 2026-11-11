import type { Knex } from 'knex';
import { consumoTeorico, type PaletInput, type ParteInput } from '@moldeados/shared';
import { auditar } from '../lib/auditoria.js';
import { ConflictError, NotFoundError, ValidationError } from '../lib/errors.js';

// Partes de producción (descuentan materia prima según receta) y palets (toman paquetes de los partes más
// viejos primero). Todo en una transacción con su auditoría; anular agrega movimientos que compensan.

export async function crearParte(db: Knex, usuarioId: string, i: ParteInput): Promise<{ id: string; numero: number }> {
  return db.transaction((trx) => insertarParte(trx, usuarioId, i));
}

/** Guarda un parte dentro de una transacción ya abierta (la planilla del día lo usa junto con otras cosas). */
export async function insertarParte(trx: Knex.Transaction, usuarioId: string, i: ParteInput): Promise<{ id: string; numero: number }> {
  {
    const v = await trx('variantes').where({ id: i.varianteId, activo: true }).whereNull('deleted_at').first('id', 'maquina_id', 'maples_por_paquete', 'maples_por_hora');
    if (!v) throw new ValidationError('Ese maple no existe o está desactivado');
    const m = await trx('maquinas').where({ id: i.maquinaId, activo: true }).whereNull('deleted_at').first('id');
    if (!m) throw new ValidationError('Esa máquina no existe o está desactivada');
    if (v.maquina_id !== i.maquinaId) throw new ValidationError('Ese maple se hace en otra máquina');
    const empleados = [...new Set(i.empleadoIds)];
    const n = await trx('empleados').whereIn('id', empleados).where({ activo: true }).whereNull('deleted_at').count<{ c: number }>('id as c').first();
    if (Number(n?.c) !== empleados.length) throw new ValidationError('Hay alguien marcado que no está en el personal activo');

    // Consumo: teórico = receta × tiempo; real = lo corregido o, si no se tocó, el teórico.
    const receta: { materia_prima_id: string; cantidad_por_hora: number }[] = await trx('receta_items').where({ variante_id: v.id }).select('materia_prima_id', 'cantidad_por_hora');
    const real = new Map(i.consumoReal.map((c) => [c.materiaPrimaId, c.cantidad]));
    const consumos = new Map<string, { teorico: number; real: number }>();
    for (const r of receta) {
      const teorico = consumoTeorico(r.cantidad_por_hora, i.minutos);
      consumos.set(r.materia_prima_id, { teorico, real: real.get(r.materia_prima_id) ?? teorico });
    }
    for (const [mp, cant] of real) if (!consumos.has(mp)) consumos.set(mp, { teorico: 0, real: cant }); // se usó algo fuera de receta
    const extra = [...consumos.keys()];
    if (extra.length) {
      const existen = await trx('materias_primas').whereIn('id', extra).whereNull('deleted_at').count<{ c: number }>('id as c').first();
      if (Number(existen?.c) !== extra.length) throw new ValidationError('Hay una materia prima que no existe');
    }

    const [parte] = await trx('partes')
      .insert({
        fecha: i.fecha, turno: i.turno, maquina_id: i.maquinaId, variante_id: v.id, minutos: i.minutos, pulpeadas: i.pulpeadas, paquetes: i.paquetes,
        maples_por_paquete: v.maples_por_paquete, maples_por_hora: v.maples_por_hora, notas: i.notas, usuario_id: usuarioId,
      })
      .returning(['id', 'numero']);
    // En la planilla del día el personal es opcional.
    if (empleados.length) await trx('parte_empleados').insert(empleados.map((e) => ({ parte_id: parte.id, empleado_id: e })));
    const filas = [...consumos].filter(([, c]) => c.teorico > 0 || c.real > 0);
    if (filas.length) {
      await trx('parte_consumos').insert(filas.map(([mp, c]) => ({ parte_id: parte.id, materia_prima_id: mp, teorico: c.teorico, real: c.real })));
      const salidas = filas.filter(([, c]) => c.real > 0);
      if (salidas.length) await trx('movimientos_stock').insert(salidas.map(([mp, c]) => ({ materia_prima_id: mp, cantidad: -c.real, motivo: 'consumo', parte_id: parte.id, usuario_id: usuarioId })));
    }
    await auditar(trx, { usuarioId, accion: 'crear', entidad: 'parte', entidadId: parte.id, despues: { ...i, consumos: Object.fromEntries(consumos) } });
    return parte;
  }
}

export async function anularParte(db: Knex, usuarioId: string, parteId: string, motivo: string): Promise<void> {
  await db.transaction(async (trx) => {
    const p = await trx('partes').where({ id: parteId }).forUpdate().first('id', 'anulado_at');
    if (!p) throw new NotFoundError('No encontramos ese parte');
    if (p.anulado_at) throw new ConflictError('Este parte ya estaba anulado');
    const enPalet = await trx('palet_lotes as l').join('palets as pa', 'pa.id', 'l.palet_id').where('l.parte_id', p.id).whereNull('pa.anulado_at').first('pa.numero');
    if (enPalet) throw new ConflictError(`Hay paquetes de este parte en el palet ${String(enPalet.numero).padStart(6, '0')}. Anulá ese palet primero.`);
    await trx('partes').where({ id: p.id }).update({ anulado_at: trx.fn.now(), anulado_por: usuarioId, motivo_anulacion: motivo, updated_at: trx.fn.now() });
    const consumos = await trx('parte_consumos').where({ parte_id: p.id }).where('real', '>', 0).select('materia_prima_id', 'real');
    if (consumos.length) await trx('movimientos_stock').insert(consumos.map((c) => ({ materia_prima_id: c.materia_prima_id, cantidad: c.real, motivo: 'anulacion_consumo', parte_id: p.id, nota: motivo, usuario_id: usuarioId })));
    await auditar(trx, { usuarioId, accion: 'anular', entidad: 'parte', entidadId: p.id, motivo });
  });
}

/** Paquetes de cada parte vigente que todavía no están en un palet vigente, del más viejo al más nuevo. */
export function lotesLibres(q: Knex | Knex.Transaction, varianteId: string) {
  return q('partes as p')
    .where({ 'p.variante_id': varianteId })
    .whereNull('p.anulado_at')
    .select('p.id', 'p.paquetes', q.raw(`p.paquetes - coalesce((select sum(l.paquetes) from palet_lotes l join palets pa on pa.id = l.palet_id where l.parte_id = p.id and pa.anulado_at is null), 0)::int as libres`))
    .orderBy([{ column: 'p.fecha' }, { column: 'p.numero' }]);
}

export async function crearPalet(db: Knex, usuarioId: string, i: PaletInput): Promise<{ id: string; numero: number }> {
  return db.transaction((trx) => armarPalet(trx, usuarioId, i, false));
}

/**
 * Arma un palet dentro de una transacción ya abierta. `suelto`: paquetes sueltos que se venden sin palet (1×1×N,
 * se arma en el despacho y no lleva etiqueta), con el mismo FIFO y la misma trazabilidad.
 */
export async function armarPalet(trx: Knex.Transaction, usuarioId: string, i: PaletInput, suelto: boolean): Promise<{ id: string; numero: number }> {
  {
    // Bloquea la variante: dos palets armados a la vez no pueden tomar los mismos paquetes.
    const v = await trx('variantes').where({ id: i.varianteId }).whereNull('deleted_at').forUpdate().first('id', 'nombre');
    if (!v) throw new ValidationError('Ese maple no existe');
    const paquetes = i.ancho * i.largo * i.alto;
    const lotes = (await lotesLibres(trx, v.id)).filter((l: { libres: number }) => l.libres > 0) as { id: string; libres: number }[];
    const disponibles = lotes.reduce((a, l) => a + l.libres, 0);
    if (disponibles < paquetes) throw new ConflictError(`${suelto ? 'Se piden' : 'Para este palet hacen falta'} ${paquetes} paquetes de ${v.nombre} y hay ${disponibles} sueltos (sin paletizar).`);

    const [palet] = await trx('palets')
      .insert({ variante_id: v.id, ancho: i.ancho, largo: i.largo, alto: i.alto, paquetes, vehiculo: i.vehiculo, destino: i.destino, notas: i.notas, usuario_id: usuarioId, suelto })
      .returning(['id', 'numero']);
    let falta = paquetes;
    const asignados: { palet_id: string; parte_id: string; paquetes: number }[] = [];
    for (const l of lotes) {
      if (falta === 0) break;
      const toma = Math.min(falta, l.libres);
      asignados.push({ palet_id: palet.id, parte_id: l.id, paquetes: toma });
      falta -= toma;
    }
    await trx('palet_lotes').insert(asignados);
    await auditar(trx, { usuarioId, accion: 'crear', entidad: 'palet', entidadId: palet.id, despues: { ...i, suelto, paquetes, lotes: asignados.map((a) => ({ parteId: a.parte_id, paquetes: a.paquetes })) } });
    return palet;
  }
}

export async function anularPalet(db: Knex, usuarioId: string, paletId: string, motivo: string): Promise<void> {
  await db.transaction(async (trx) => {
    const p = await trx('palets').where({ id: paletId }).forUpdate().first('id', 'anulado_at', 'venta_id');
    if (!p) throw new NotFoundError('No encontramos ese palet');
    if (p.anulado_at) throw new ConflictError('Este palet ya estaba anulado');
    if (p.venta_id) throw new ConflictError('Este palet ya se vendió. Para desarmarlo, primero anulá la venta.');
    await trx('palets').where({ id: p.id }).update({ anulado_at: trx.fn.now(), anulado_por: usuarioId, motivo_anulacion: motivo, updated_at: trx.fn.now() });
    await auditar(trx, { usuarioId, accion: 'anular', entidad: 'palet', entidadId: p.id, motivo });
  });
}

/** Stock de maples por variante, en paquetes. */
export async function stockMaples(db: Knex) {
  return db('variantes as v')
    .whereNull('v.deleted_at')
    .select(
      'v.id', 'v.codigo', 'v.nombre', 'v.color_hex as colorHex', 'v.maples_por_paquete as maplesPorPaquete', 'v.activo',
      db.raw('coalesce((select sum(p.paquetes) from partes p where p.variante_id = v.id and p.anulado_at is null), 0)::int as producido'),
      db.raw('coalesce((select sum(l.paquetes) from palet_lotes l join palets pa on pa.id = l.palet_id where pa.variante_id = v.id and pa.anulado_at is null), 0)::int as "enPalets"'),
      db.raw('coalesce((select sum(pa.paquetes) from palets pa join ventas ve on ve.id = pa.venta_id where pa.variante_id = v.id and pa.anulado_at is null), 0)::int as vendido'),
      // Lo que falta entregar de pedidos abiertos: para saber si el stock alcanza.
      db.raw(`coalesce((select sum(greatest(pi.paquetes - coalesce((select sum(pa.paquetes) from palets pa join ventas ve on ve.id = pa.venta_id
               where ve.pedido_id = pe.id and ve.anulado_at is null and pa.variante_id = pi.variante_id), 0), 0))
             from pedido_items pi join pedidos pe on pe.id = pi.pedido_id where pe.estado = 'abierto' and pi.variante_id = v.id), 0)::int as "comprometido"`),
    )
    .orderBy('v.codigo');
}

/**
 * Trazabilidad del palet (lo que muestra el QR): de qué partes salió, quién y con qué máquina lo hizo, qué
 * materia prima se consumió y de qué compras vino.
 * ponytail: el origen de la materia prima es aproximado (las últimas compras antes de producir que cubren lo
 * consumido); el stock no se lleva por lote. Si piden trazabilidad exacta, asignar lote de MP en cada parte.
 */
export async function trazabilidad(db: Knex, paletId: string) {
  const palet = await db('palets as pa')
    .join('variantes as v', 'v.id', 'pa.variante_id')
    .join('usuarios as u', 'u.id', 'pa.usuario_id')
    .leftJoin('usuarios as ua', 'ua.id', 'pa.anulado_por')
    .where('pa.id', paletId)
    .first(
      'pa.id', 'pa.numero', 'pa.ancho', 'pa.largo', 'pa.alto', 'pa.paquetes', 'pa.vehiculo', 'pa.destino', 'pa.notas', 'pa.created_at as armadoAt',
      'pa.anulado_at as anuladoAt', 'pa.motivo_anulacion as motivoAnulacion', 'ua.nombre as anuladoPor', 'u.nombre as armadoPor',
      'v.id as varianteId', 'v.codigo', 'v.nombre as variante', 'v.color_hex as colorHex', 'v.tamano', 'v.maples_por_paquete as maplesPorPaquete',
    );
  if (!palet) throw new NotFoundError('No encontramos ese palet');

  const lotes = await db('palet_lotes as l')
    .join('partes as p', 'p.id', 'l.parte_id')
    .join('maquinas as m', 'm.id', 'p.maquina_id')
    .where('l.palet_id', paletId)
    .select('p.id', 'p.numero', 'p.fecha', 'p.turno', 'm.codigo as maquina', 'l.paquetes',
      db.raw(`(select string_agg(e.nombre, ', ' order by e.nombre) from parte_empleados pe join empleados e on e.id = pe.empleado_id where pe.parte_id = p.id) as personal`))
    .orderBy([{ column: 'p.fecha' }, { column: 'p.numero' }]);

  const parteIds = lotes.map((l) => l.id);
  const consumos: { id: string; nombre: string; unidad: 'kg' | 'l'; real: number }[] = parteIds.length
    ? await db('parte_consumos as c').join('materias_primas as mp', 'mp.id', 'c.materia_prima_id').whereIn('c.parte_id', parteIds)
      .groupBy('mp.id', 'mp.nombre', 'mp.unidad').select('mp.id', 'mp.nombre', 'mp.unidad', db.raw('sum(c.real)::bigint as real'))
    : [];
  const hasta = lotes.reduce((a, l) => (l.fecha > a ? l.fecha : a), '0000-00-00');

  // Una sola consulta (antes una por materia prima): las compras de cada materia, de la más nueva a la más vieja,
  // con la suma acumulada; se queda con las necesarias para cubrir lo consumido.
  const compras: { materia_prima_id: string; id: string; numero: number; fecha: string; tipo: string; proveedor: string; cantidad: number }[] = consumos.length
    ? (await db.raw(
      // Por materia (lateral), solo sus últimas 20 compras hasta la fecha, con la suma acumulada sobre esas.
      `select u.mp as materia_prima_id, x.id, x.numero, x.fecha, x.tipo, x.proveedor, x.cantidad
       from unnest(?::uuid[], ?::bigint[]) as u(mp, usado)
       cross join lateral (
         select y.*, sum(y.cantidad) over (order by y.fecha_d desc, y.numero desc) as acumulado
         from (
           select co.id, co.numero, co.fecha as fecha_d, to_char(co.fecha, 'YYYY-MM-DD') as fecha, co.tipo, pr.nombre as proveedor, i.cantidad
           -- "offset 0": primero los ítems de ESA materia por su índice y después las compras. Si no, Postgres recorre
           -- todas las compras por fecha buscándola, y con una materia que casi no se compra lee el historial entero.
           from (select ci.compra_id, ci.cantidad from compra_items ci where ci.materia_prima_id = u.mp offset 0) i
           join compras co on co.id = i.compra_id join proveedores pr on pr.id = co.proveedor_id
           where co.anulada_at is null and co.fecha <= ?
           order by co.fecha desc, co.numero desc limit 20
         ) y
       ) x
       where x.acumulado - x.cantidad < u.usado
       order by x.fecha desc, x.numero desc`,
      [consumos.map((c) => c.id), consumos.map((c) => Number(c.real)), hasta],
    )).rows
    : [];
  const origen = consumos.map((c) => ({ ...c, compras: compras.filter((co) => co.materia_prima_id === c.id).map(({ materia_prima_id: _, ...co }) => co) }));
  const venta = await db('palets as pa').join('ventas as v', 'v.id', 'pa.venta_id').join('clientes as c', 'c.id', 'v.cliente_id').where('pa.id', paletId)
    .first('v.id', 'v.numero', 'v.fecha', 'v.retira', 'v.vehiculo', 'v.patente', 'c.nombre as cliente');
  return { ...palet, lotes, origen, venta: venta ?? null };
}

/** Máquinas con las horas trabajadas desde su último service (de los partes) y si ya le toca. */
export async function maquinasConService(db: Knex) {
  const filas = await db('maquinas as m').whereNull('m.deleted_at')
    .select('m.id', 'm.codigo', 'm.nombre', 'm.activo', 'm.service_cada_horas as serviceCadaHoras',
      db.raw('(select max(s.fecha) from servicios_maquina s where s.maquina_id = m.id) as "ultimoService"'),
      db.raw(`coalesce((select sum(p.minutos) from partes p where p.maquina_id = m.id and p.anulado_at is null
               and p.fecha > coalesce((select max(s.fecha) from servicios_maquina s where s.maquina_id = m.id), '-infinity'::date)), 0)::int as "minutosDesdeService"`))
    .orderBy('m.codigo');
  return filas.map((m) => {
    const horas = Math.round(m.minutosDesdeService / 60);
    const cada = m.serviceCadaHoras as number | null;
    return { ...m, horasDesdeService: horas, leTocaService: cada !== null && horas >= cada * 0.9, servicePasado: cada !== null && horas >= cada };
  });
}

/**
 * Horas por persona en un período: cada parte suma sus horas de máquina a quienes figuran en él.
 * ponytail: si alguien figura en dos máquinas a la vez, suma las dos; si hace falta asistencia real, fichar entrada y salida.
 */
export async function horasPorPersona(db: Knex, desde?: string, hasta?: string) {
  const filas = await db('empleados as e')
    .leftJoin('parte_empleados as pe', 'pe.empleado_id', 'e.id')
    .leftJoin('partes as p', (j) => {
      j.on('p.id', 'pe.parte_id').andOnNull('p.anulado_at');
      if (desde) j.andOn('p.fecha', '>=', db.raw('?', [desde]));
      if (hasta) j.andOn('p.fecha', '<=', db.raw('?', [hasta]));
    })
    .whereNull('e.deleted_at')
    .groupBy('e.id', 'e.nombre', 'e.valor_hora_centavos', 'e.activo')
    .select('e.id', 'e.nombre', 'e.activo', 'e.valor_hora_centavos as valorHora',
      db.raw('coalesce(sum(p.minutos), 0)::int as minutos'),
      db.raw("coalesce(sum(p.minutos) filter (where p.turno = 'manana'), 0)::int as manana"),
      db.raw("coalesce(sum(p.minutos) filter (where p.turno = 'tarde'), 0)::int as tarde"),
      db.raw('count(p.id)::int as partes'),
      db.raw('count(distinct p.fecha)::int as dias'))
    .orderBy('e.nombre');
  return filas
    .filter((f) => f.activo || f.minutos > 0)
    .map((f) => ({ ...f, valorHora: f.valorHora === null ? null : Number(f.valorHora), estimado: f.valorHora === null ? null : Math.round((Number(f.valorHora) * f.minutos) / 60) }));
}
