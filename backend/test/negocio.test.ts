import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { aCentavos, aMili, armarMatriz, calcularCompra, pesajeSchema } from '@moldeados/shared';
import { db } from '../src/db.js';
import { anularCompra, crearCompra, crearPesaje } from '../src/features/compras.service.js';

// Lo que duele si se rompe: plata, stock y permisos.

describe('cálculos', () => {
  it('parsea montos y cantidades en formato argentino', () => {
    expect(aCentavos('1.234,56')).toBe(123456);
    expect(aCentavos('1234.5')).toBe(123450);
    expect(aMili('5000,25')).toBe(5000250);
    expect(aMili('8.420')).toBe(8_420_000); // punto de miles, como en la báscula
    expect(aMili('12.5')).toBe(12_500);
    expect(aMili('abc')).toBeNull();
  });

  it('total de compra: subtotal por kg + IVA redondeado', () => {
    // 5.000,250 kg a $85,50/kg = $427.521,38 ; IVA 21 % = $89.779,49
    expect(calcularCompra([{ cantidad: 5_000_250, precioUnitario: 8550 }], 2100)).toEqual({ neto: 42_752_138, iva: 8_977_949, total: 51_730_087 });
  });

  it('el pesaje exige bruto mayor que tara', () => {
    const base = { proveedorId: crypto.randomUUID(), fecha: '2026-11-03', conFactura: false, ivaBp: 0, materiaPrimaId: crypto.randomUUID(), precioPorKg: 100 };
    expect(pesajeSchema.safeParse({ ...base, brutoG: 1000, taraG: 1000 }).success).toBe(false);
    expect(pesajeSchema.safeParse({ ...base, brutoG: 1001, taraG: 1000 }).success).toBe(true);
  });

  it('permisos: el dueño no se puede recortar y los niveles se acotan', () => {
    const m = armarMatriz([{ rol: 'dueno', modulo: 'compras', nivel: 0 }, { rol: 'operario', modulo: 'compras', nivel: 9 }]);
    expect(m.dueno.compras).toBe(3);
    expect(m.operario.compras).toBe(3);
    expect(m.operario.usuarios).toBe(0);
  });
});

describe('compras y stock (moldeados_test)', () => {
  let usuarioId: string, proveedorId: string, carton: string, tinta: string;
  const stock = async (id: string) => Number((await db('movimientos_stock').where({ materia_prima_id: id }).sum('cantidad as s').first())?.s ?? 0);

  beforeEach(async () => {
    await db.raw('truncate movimientos_stock, compra_items, compras, materias_primas, proveedores, auditoria, rol_permisos, usuarios cascade');
    [{ id: usuarioId }] = await db('usuarios').insert({ nombre: 'Test', usuario: 'test', password_hash: 'x', rol: 'dueno' }).returning('id');
    [{ id: proveedorId }] = await db('proveedores').insert({ nombre: 'Reciclados Sur' }).returning('id');
    [{ id: carton }] = await db('materias_primas').insert({ nombre: 'Cartón', tipo: 'carton', unidad: 'kg' }).returning('id');
    [{ id: tinta }] = await db('materias_primas').insert({ nombre: 'Tinta roja', tipo: 'tinta', unidad: 'l' }).returning('id');
  });
  afterAll(() => db.destroy());

  it('un pesaje suma el neto al stock y anularlo lo devuelve, una sola vez', async () => {
    const c = await crearPesaje(db, usuarioId, pesajeSchema.parse({ proveedorId, fecha: '2026-11-03', conFactura: true, nroFactura: 'A-1', ivaBp: 2100, materiaPrimaId: carton, brutoG: 7_500_000, taraG: 2_500_000, precioPorKg: 10000 }));
    expect(await stock(carton)).toBe(5_000_000);
    const fila = await db('compras').where({ id: c.id }).first();
    expect(fila.total_centavos).toBe(60_500_000); // 5.000 kg × $100 + 21 %
    await anularCompra(db, usuarioId, c.id, 'Pesada duplicada');
    expect(await stock(carton)).toBe(0);
    await expect(anularCompra(db, usuarioId, c.id, 'otra vez')).rejects.toThrow('ya estaba anulada');
    expect(await db('auditoria').where({ entidad_id: c.id }).count('* as n').first()).toMatchObject({ n: 2 });
  });

  it('sin factura no guarda IVA aunque venga', async () => {
    const c = await crearCompra(db, usuarioId, { proveedorId, fecha: '2026-11-03', conFactura: false, nroFactura: 'X', ivaBp: 2100, notas: null, items: [{ materiaPrimaId: tinta, cantidad: 20_000, precioUnitario: 500_000 }] });
    const fila = await db('compras').where({ id: c.id }).first();
    expect([fila.iva_bp, fila.iva_centavos, fila.nro_factura, fila.total_centavos]).toEqual([0, 0, null, 10_000_000]);
    expect(await stock(tinta)).toBe(20_000);
  });

  it('el pesaje rechaza materia prima que no es cartón y no deja nada a medias', async () => {
    await expect(crearPesaje(db, usuarioId, pesajeSchema.parse({ proveedorId, fecha: '2026-11-03', conFactura: false, ivaBp: 0, materiaPrimaId: tinta, brutoG: 2000, taraG: 1000, precioPorKg: 1 }))).rejects.toThrow('solo para cartón');
    expect(await db('compras').count('* as n').first()).toMatchObject({ n: 0 });
  });
});
