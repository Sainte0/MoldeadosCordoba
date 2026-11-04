import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { aMinutos, consumoTeorico, paquetesTeoricos, parteSchema } from '@moldeados/shared';
import { db } from '../src/db.js';
import { anularPalet, anularParte, crearPalet, crearParte, stockMaples, trazabilidad } from '../src/features/produccion.service.js';

describe('cálculos de producción', () => {
  it('consumo teórico y paquetes esperados por tiempo trabajado', () => {
    expect(consumoTeorico(12_000, 450)).toBe(90_000); // 12 L/h × 7,5 h = 90 L
    expect(paquetesTeoricos(3000, 450, 60)).toBe(375);
    expect(paquetesTeoricos(0, 450, 60)).toBeNull();
    expect(aMinutos('7:30')).toBe(450);
    expect(aMinutos('7,5')).toBe(450);
  });
});

describe('partes y palets (moldeados_test)', () => {
  let usuarioId: string, maquina: string, otraMaquina: string, variante: string, tinta: string, carton: string, empleado: string;
  const stock = async (id: string) => Number((await db('movimientos_stock').where({ materia_prima_id: id }).sum('cantidad as s').first())?.s ?? 0);
  const parte = (paquetes: number, fecha = '2026-11-03', extra = {}) =>
    crearParte(db, usuarioId, parteSchema.parse({ fecha, turno: 'manana', maquinaId: maquina, varianteId: variante, empleadoIds: [empleado], minutos: 450, pulpeadas: 10, paquetes, ...extra }));

  beforeEach(async () => {
    await db.raw('truncate palet_lotes, palets, parte_consumos, parte_empleados, partes, receta_items, variantes, maquinas, empleados, movimientos_stock, compra_items, compras, materias_primas, proveedores, auditoria, usuarios cascade');
    [{ id: usuarioId }] = await db('usuarios').insert({ nombre: 'Test', usuario: 'test', password_hash: 'x', rol: 'dueno' }).returning('id');
    [{ id: maquina }] = await db('maquinas').insert({ codigo: 'MP-2', nombre: 'Grande' }).returning('id');
    [{ id: otraMaquina }] = await db('maquinas').insert({ codigo: 'MP-1', nombre: 'Chica' }).returning('id');
    [{ id: variante }] = await db('variantes').insert({ codigo: 'MGR-ROJ', nombre: 'Grande rojo', tamano: 'grande', color_hex: '#b3262a', maquina_id: maquina, maples_por_hora: 3000 }).returning('id');
    [{ id: tinta }] = await db('materias_primas').insert({ nombre: 'Tinta roja', tipo: 'tinta', unidad: 'l' }).returning('id');
    [{ id: carton }] = await db('materias_primas').insert({ nombre: 'Cartón', tipo: 'carton', unidad: 'kg' }).returning('id');
    await db('receta_items').insert([{ variante_id: variante, materia_prima_id: tinta, cantidad_por_hora: 12_000 }, { variante_id: variante, materia_prima_id: carton, cantidad_por_hora: 200_000 }]);
    [{ id: empleado }] = await db('empleados').insert({ nombre: 'Ana' }).returning('id');
  });
  afterAll(() => db.destroy());

  it('el parte descuenta la receta, respeta lo corregido y anularlo lo devuelve', async () => {
    const p = await parte(370, '2026-11-03', { consumoReal: [{ materiaPrimaId: tinta, cantidad: 95_000 }] });
    expect(await stock(tinta)).toBe(-95_000); // corregido a mano
    expect(await stock(carton)).toBe(-1_500_000); // 200 kg/h × 7,5 h
    await anularParte(db, usuarioId, p.id, 'Cargado dos veces');
    expect([await stock(tinta), await stock(carton)]).toEqual([0, 0]);
  });

  it('no deja cargar un maple en una máquina que no es la suya', async () => {
    await expect(parte(10, '2026-11-03', { maquinaId: otraMaquina })).rejects.toThrow('otra máquina');
  });

  it('el palet toma paquetes de los partes más viejos primero y no sobrepasa el stock', async () => {
    const viejo = await parte(20, '2026-11-01');
    const nuevo = await parte(30, '2026-11-02');
    const pal = await crearPalet(db, usuarioId, { varianteId: variante, ancho: 2, largo: 3, alto: 6, vehiculo: 'chasis', destino: null, notas: null }); // 36
    const lotes = await db('palet_lotes').where({ palet_id: pal.id }).orderBy('paquetes', 'desc').select('parte_id', 'paquetes');
    expect(lotes).toEqual([{ parte_id: viejo.id, paquetes: 20 }, { parte_id: nuevo.id, paquetes: 16 }]);
    const [s] = await stockMaples(db);
    expect([s.producido, s.enPalets]).toEqual([50, 36]);
    await expect(crearPalet(db, usuarioId, { varianteId: variante, ancho: 2, largo: 3, alto: 4, vehiculo: null, destino: null, notas: null })).rejects.toThrow('hay 14 sin paletizar');

    // Un parte que está en un palet no se anula hasta desarmar el palet.
    await expect(anularParte(db, usuarioId, viejo.id, 'x')).rejects.toThrow('Anulá ese palet primero');
    const t = await trazabilidad(db, pal.id);
    expect(t.lotes.map((l: { personal: string }) => l.personal)).toEqual(['Ana', 'Ana']);
    await anularPalet(db, usuarioId, pal.id, 'Se desarmó');
    await anularParte(db, usuarioId, viejo.id, 'Error de carga');
    expect((await stockMaples(db))[0]).toMatchObject({ producido: 30, enPalets: 0 });
  });
});
