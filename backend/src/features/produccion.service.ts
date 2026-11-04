import type { Knex } from 'knex';
import { consumoTeorico, type PaletInput, type ParteInput } from '@moldeados/shared';
import { auditar } from '../lib/auditoria.js';
import { ConflictError, NotFoundError, ValidationError } from '../lib/errors.js';

// Partes de producción (descuentan materia prima según receta) y palets (toman paquetes de los partes más
// viejos primero). Todo en una transacción con su auditoría; anular agrega movimientos que compensan.

export async function crearParte(db: Knex, usuarioId: string, i: ParteInput): Promise<{ id: string; numero: number }> {
  return db.transaction(async (trx) => {
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
    await trx('parte_empleados').insert(empleados.map((e) => ({ parte_id: parte.id, empleado_id: e })));
    const filas = [...consumos].filter(([, c]) => c.teorico > 0 || c.real > 0);
    if (filas.length) {
      await trx('parte_consumos').insert(filas.map(([mp, c]) => ({ parte_id: parte.id, materia_prima_id: mp, teorico: c.teorico, real: c.real })));
      const salidas = filas.filter(([, c]) => c.real > 0);
      if (salidas.length) await trx('movimientos_stock').insert(salidas.map(([mp, c]) => ({ materia_prima_id: mp, cantidad: -c.real, motivo: 'consumo', parte_id: parte.id, usuario_id: usuarioId })));
    }
    await auditar(trx, { usuarioId, accion: 'crear', entidad: 'parte', entidadId: parte.id, despues: { ...i, consumos: Object.fromEntries(consumos) } });
    return parte;
  });
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
function lotesLibres(q: Knex | Knex.Transaction, varianteId: string) {
  return q('partes as p')
    .where({ 'p.variante_id': varianteId })
    .whereNull('p.anulado_at')
    .select('p.id', 'p.paquetes', q.raw(`p.paquetes - coalesce((select sum(l.paquetes) from palet_lotes l join palets pa on pa.id = l.palet_id where l.parte_id = p.id and pa.anulado_at is null), 0)::int as libres`))
    .orderBy([{ column: 'p.fecha' }, { column: 'p.numero' }]);
}

export async function crearPalet(db: Knex, usuarioId: string, i: PaletInput): Promise<{ id: string; numero: number }> {
  return db.transaction(async (trx) => {
    // Bloquea la variante: dos palets armados a la vez no pueden tomar los mismos paquetes.
    const v = await trx('variantes').where({ id: i.varianteId }).whereNull('deleted_at').forUpdate().first('id', 'nombre');
    if (!v) throw new ValidationError('Ese maple no existe');
    const paquetes = i.ancho * i.largo * i.alto;
    const lotes = (await lotesLibres(trx, v.id)).filter((l: { libres: number }) => l.libres > 0) as { id: string; libres: number }[];
    const disponibles = lotes.reduce((a, l) => a + l.libres, 0);
    if (disponibles < paquetes) throw new ConflictError(`Para este palet hacen falta ${paquetes} paquetes de ${v.nombre} y hay ${disponibles} sin paletizar.`);

    const [palet] = await trx('palets')
      .insert({ variante_id: v.id, ancho: i.ancho, largo: i.largo, alto: i.alto, paquetes, vehiculo: i.vehiculo, destino: i.destino, notas: i.notas, usuario_id: usuarioId })
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
    await auditar(trx, { usuarioId, accion: 'crear', entidad: 'palet', entidadId: palet.id, despues: { ...i, paquetes, lotes: asignados.map((a) => ({ parteId: a.parte_id, paquetes: a.paquetes })) } });
    return palet;
  });
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

  const origen = [];
  for (const c of consumos) {
    const compras = await db('compra_items as i').join('compras as co', 'co.id', 'i.compra_id').join('proveedores as pr', 'pr.id', 'co.proveedor_id')
      .where('i.materia_prima_id', c.id).whereNull('co.anulada_at').where('co.fecha', '<=', hasta)
      .select('co.id', 'co.numero', 'co.fecha', 'co.tipo', 'pr.nombre as proveedor', 'i.cantidad')
      .orderBy([{ column: 'co.fecha', order: 'desc' }, { column: 'co.numero', order: 'desc' }]).limit(20);
    let acumulado = 0;
    const usadas = [];
    for (const co of compras) {
      usadas.push(co);
      acumulado += co.cantidad;
      if (acumulado >= c.real) break;
    }
    origen.push({ ...c, compras: usadas });
  }
  const venta = await db('palets as pa').join('ventas as v', 'v.id', 'pa.venta_id').join('clientes as c', 'c.id', 'v.cliente_id').where('pa.id', paletId)
    .first('v.id', 'v.numero', 'v.fecha', 'v.retira', 'v.vehiculo', 'v.patente', 'c.nombre as cliente');
  return { ...palet, lotes, origen, venta: venta ?? null };
}
