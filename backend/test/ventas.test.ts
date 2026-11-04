import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { calcularVenta, movimientoDineroSchema, ventaSchema } from '@moldeados/shared';
import { db } from '../src/db.js';
import { anularPalet } from '../src/features/produccion.service.js';
import { buscar } from '../src/lib/buscar.js';
import { anularMovimiento, anularVenta, crearMovimiento, crearVenta, cuentaCorriente, saldos } from '../src/features/ventas.service.js';

describe('cálculo de venta', () => {
  it('maples × precio por maple + IVA', () => {
    // 2.160 maples a $150,50 = $325.080 ; IVA 21 % = $68.266,80
    expect(calcularVenta([{ maples: 2160, precioMaple: 15050 }], 2100)).toEqual({ neto: 32_508_000, iva: 6_826_680, total: 39_334_680 });
  });
  it('un cheque físico sin número o sin banco no pasa', () => {
    const base = { tipo: 'cobro', clienteId: crypto.randomUUID(), fecha: '2026-11-03', monto: 100, medio: 'cheque' };
    expect(movimientoDineroSchema.safeParse(base).success).toBe(false);
    expect(movimientoDineroSchema.safeParse({ ...base, bancoId: crypto.randomUUID(), chequeNumero: '123', chequeFechaCobro: '2026-12-01' }).success).toBe(true);
  });
});

describe('despacho y cuentas (moldeados_test)', () => {
  let u: string, cliente: string, otro: string, variante: string, palet1: string, palet2: string, banco: string;

  beforeEach(async () => {
    await db.raw('truncate movimientos_dinero, venta_items, ventas, precios_cliente, clientes, palet_lotes, palets, parte_consumos, parte_empleados, partes, receta_items, variantes, maquinas, empleados, movimientos_stock, compra_items, compras, materias_primas, proveedores, auditoria, usuarios cascade');
    [{ id: u }] = await db('usuarios').insert({ nombre: 'Test', usuario: 'test', password_hash: 'x', rol: 'dueno' }).returning('id');
    const [{ id: maq }] = await db('maquinas').insert({ codigo: 'MP-2', nombre: 'Grande' }).returning('id');
    [{ id: variante }] = await db('variantes').insert({ codigo: 'MGR-ROJ', nombre: 'Grande rojo', tamano: 'grande', maquina_id: maq, precio_maple_centavos: 15000 }).returning('id');
    [{ id: cliente }] = await db('clientes').insert({ nombre: 'Granja Los Álamos' }).returning('id');
    [{ id: otro }] = await db('clientes').insert({ nombre: 'Avícola Sur' }).returning('id');
    await db('precios_cliente').insert({ cliente_id: otro, variante_id: variante, precio_maple_centavos: 14000 });
    const [{ id: parte }] = await db('partes').insert({ fecha: '2026-11-03', turno: 'manana', maquina_id: maq, variante_id: variante, minutos: 60, paquetes: 72, maples_por_paquete: 60, maples_por_hora: 0, usuario_id: u }).returning('id');
    [{ id: palet1 }] = await db('palets').insert({ variante_id: variante, ancho: 2, largo: 3, alto: 6, paquetes: 36, usuario_id: u }).returning('id');
    [{ id: palet2 }] = await db('palets').insert({ variante_id: variante, ancho: 2, largo: 3, alto: 6, paquetes: 36, usuario_id: u }).returning('id');
    await db('palet_lotes').insert([{ palet_id: palet1, parte_id: parte, paquetes: 36 }, { palet_id: palet2, parte_id: parte, paquetes: 36 }]);
    [{ id: banco }] = await db('bancos').insert({ nombre: 'Galicia' }).returning('id');
  });
  afterAll(() => db.destroy());

  const venta = (clienteId: string, palets: string[], extra = {}) =>
    crearVenta(db, u, ventaSchema.parse({ clienteId, fecha: '2026-11-03', conFactura: false, ivaBp: 0, retira: 'Juan (chofer)', palets, ...extra }));

  it('vende al precio especial del cliente o al de lista, y un palet no sale dos veces', async () => {
    const v1 = await venta(otro, [palet1]);
    expect((await db('ventas').where({ id: v1.id }).first()).total_centavos).toBe(2160 * 14000);
    await expect(venta(cliente, [palet1, palet2])).rejects.toThrow('ya se vendió');
    expect(await db('ventas').count('* as n').first()).toMatchObject({ n: 1 }); // no quedó nada a medias
    const v2 = await venta(cliente, [palet2]);
    expect((await db('ventas').where({ id: v2.id }).first()).total_centavos).toBe(2160 * 15000);
  });

  it('un palet vendido no se desarma; anulando la venta vuelve a estar disponible', async () => {
    const v = await venta(cliente, [palet1]);
    await expect(anularPalet(db, u, palet1, 'x')).rejects.toThrow('primero anulá la venta');
    await anularVenta(db, u, v.id, 'Se canceló el viaje');
    expect((await db('palets').where({ id: palet1 }).first()).venta_id).toBeNull();
    await venta(otro, [palet1]); // se puede volver a vender
  });

  it('cuenta corriente: ventas suman, cobros restan, lo anulado no cuenta', async () => {
    await venta(cliente, [palet1, palet2]); // 4.320 × $150 = $648.000
    const c1 = await crearMovimiento(db, u, movimientoDineroSchema.parse({ tipo: 'cobro', clienteId: cliente, fecha: '2026-11-03', monto: 40_000_000, medio: 'echeq', bancoId: banco, chequeNumero: 'E-1', chequeFechaCobro: '2026-12-01' }));
    await crearMovimiento(db, u, movimientoDineroSchema.parse({ tipo: 'cobro', clienteId: cliente, fecha: '2026-11-03', monto: 5_000_000, medio: 'efectivo' }));
    await anularMovimiento(db, u, c1.id, 'Cheque rechazado');
    const s = (await saldos(db, 'cliente')).find((x) => x.id === cliente)!;
    expect(Number(s.debe) - Number(s.haber)).toBe(64_800_000 - 5_000_000);
    const cc = await cuentaCorriente(db, 'cliente', cliente);
    expect(cc.at(-1)!.saldo).toBe(59_800_000);
  });

  it('sin acentos, por varias palabras y por número', async () => {
    const nombres = async (q: string) => (await db('clientes as c').modify(buscar(q, ['c.nombre'])).pluck('c.nombre')).sort();
    expect(await nombres('alamos')).toEqual(['Granja Los Álamos']);
    expect(await nombres('AVÍCOLA sur')).toEqual(['Avícola Sur']);
    expect(await nombres('granja sur')).toEqual([]);
    expect(await nombres('100%')).toEqual([]); // los comodines del usuario no rompen nada
  });
});
