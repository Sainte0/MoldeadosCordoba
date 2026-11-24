import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { repartirCuentas } from '@moldeados/shared';
import { db } from '../src/db.js';
import { cancelarOrden, cargarPalletPlastificado, cerrarCorta, crearOrden, escanear, numeroDeEscaneo, stockPorAlto } from '../src/features/ordenes.js';
import { anularVenta } from '../src/features/ventas.service.js';

describe('pedido 01: pallet de plastificadora y orden de venta con QR (moldeados_test)', () => {
  let u: string, roj: string, nat: string, cliente: string;

  beforeEach(async () => {
    await db.raw('truncate orden_palets, orden_items, ordenes, chofer_clientes, choferes, movimientos_dinero, venta_items, ventas, precios_cliente, clientes, palet_lotes, palets, variantes, maquinas, auditoria, usuarios cascade');
    [{ id: u }] = await db('usuarios').insert({ nombre: 'Gerente', usuario: 'gerente', password_hash: 'x', rol: 'gerente' }).returning('id');
    const [{ id: maq }] = await db('maquinas').insert({ codigo: 'MP-1', nombre: 'Chica' }).returning('id');
    [{ id: roj }] = await db('variantes').insert({ codigo: 'MCH-ROJ', nombre: 'Chico rojo', tamano: 'chico', color: 'Rojo', maquina_id: maq, precio_maple_centavos: 10000 }).returning('id');
    [{ id: nat }] = await db('variantes').insert({ codigo: 'MCH-NAT', nombre: 'Chico natural', tamano: 'chico', maquina_id: maq, precio_maple_centavos: 9000 }).returning('id');
    [{ id: cliente }] = await db('clientes').insert({ nombre: 'Granja Las Flores', condicion_pago: 'mixta', porcentaje_cuenta1: 10 }).returning('id');
  });
  afterAll(() => db.destroy());

  const pallet = async (varianteId: string, alto: number) => (await cargarPalletPlastificado(db, u, { varianteId, alto })).numero;
  const orden = (items: { varianteId: string; alto: number; cantidad: number }[], condicionPago: 'cuenta1' | 'cuenta2' | 'mixta' = 'mixta') =>
    crearOrden(db, u, { clienteId: cliente, choferId: null, condicionPago, porcentajeCuenta1: condicionPago === 'mixta' ? 10 : null, items, notas: null });

  it('el pallet entra al stock sin producción: 7 de alto = 42 paquetes = 2.520 maples, visto por tipo y alto', async () => {
    await pallet(roj, 7); await pallet(roj, 7); await pallet(roj, 6);
    const p = await db('palets').first('paquetes', 'ancho', 'largo');
    expect(p).toMatchObject({ paquetes: 42, ancho: 3, largo: 2 });
    expect(await db('palet_lotes').count('* as c').first()).toMatchObject({ c: 0 });
    const s = await stockPorAlto(db);
    expect(s.map((x) => [x.codigo, x.alto, x.pallets])).toEqual([['MCH-ROJ', 7, 2], ['MCH-ROJ', 6, 1]]);
  });

  it('lee el número del QR (URL o número solo, aunque la pistola cambie la barra)', () => {
    expect(numeroDeEscaneo('https://moldeados.x/palets/123')).toBe(123);
    expect(numeroDeEscaneo('https:--moldeados.x-palets-000045')).toBe(45);
    expect(numeroDeEscaneo('  77\n')).toBe(77);
    expect(numeroDeEscaneo('hola')).toBeNull();
  });

  it('rechaza lo que no corresponde y al último pallet cierra sola: Mixta reparte 10% Cuenta 1 / 90% Cuenta 2', async () => {
    const a = await pallet(roj, 7); const b = await pallet(roj, 7); const otro = await pallet(roj, 6); const nat7 = await pallet(nat, 7);
    const o = await orden([{ varianteId: roj, alto: 7, cantidad: 2 }]);
    await expect(escanear(db, u, o.id, String(otro))).rejects.toThrow('no corresponde');
    await expect(escanear(db, u, o.id, String(nat7))).rejects.toThrow('no corresponde');
    await expect(escanear(db, u, o.id, '999999')).rejects.toThrow('no es de ningún pallet');
    expect(await escanear(db, u, o.id, `https://x/palets/${a}`)).toMatchObject({ completa: false });
    await expect(escanear(db, u, o.id, String(a))).rejects.toThrow('ya está escaneado');
    expect(await escanear(db, u, o.id, String(b))).toMatchObject({ completa: true });
    await expect(escanear(db, u, o.id, String(otro))).rejects.toThrow('cerrada');

    const ventas = await db('ventas').where({ orden_id: o.id }).orderBy('con_factura', 'desc').select('con_factura', 'neto_centavos', 'iva_centavos');
    // 2 pallets × 2.520 maples × $100: Cuenta 1 = 252 maples por pallet (+ IVA), Cuenta 2 = 2.268.
    expect(ventas).toEqual([
      { con_factura: true, neto_centavos: 2 * 252 * 10000, iva_centavos: Math.round(2 * 252 * 10000 * 0.21) },
      { con_factura: false, neto_centavos: 2 * 2268 * 10000, iva_centavos: 0 },
    ]);
    expect((await stockPorAlto(db)).reduce((n, s) => n + s.pallets, 0)).toBe(2); // salieron del stock
    expect(await db('ordenes').where({ id: o.id }).first('estado')).toMatchObject({ estado: 'cerrada' });

    // Anular una de las dos ventas anula la orden entera y los pallets vuelven.
    const [v1] = await db('ventas').where({ orden_id: o.id }).pluck('id');
    await anularVenta(db, u, v1, 'Cargado por error');
    expect(await db('ventas').where({ orden_id: o.id }).whereNull('anulado_at').count('* as c').first()).toMatchObject({ c: 0 });
    expect((await stockPorAlto(db)).reduce((n, s) => n + s.pallets, 0)).toBe(4);
  });

  it('renglón completo, pallet vendido; el gerente cierra corta o cancela', async () => {
    const a = await pallet(roj, 7); const b = await pallet(roj, 7); const c = await pallet(nat, 6);
    const o = await orden([{ varianteId: roj, alto: 7, cantidad: 1 }, { varianteId: nat, alto: 6, cantidad: 5 }], 'cuenta2');
    await escanear(db, u, o.id, String(a));
    await expect(escanear(db, u, o.id, String(b))).rejects.toThrow('Ya están todos los MCH-ROJ de 7');
    await escanear(db, u, o.id, String(c));
    await cerrarCorta(db, u, o.id, 'Entraron menos');
    const v = await db('ventas').where({ orden_id: o.id }).select('con_factura', 'total_centavos');
    expect(v).toEqual([{ con_factura: false, total_centavos: 2520 * 10000 + 2160 * 9000 }]);

    const o2 = await orden([{ varianteId: roj, alto: 7, cantidad: 2 }], 'cuenta1');
    await expect(escanear(db, u, o2.id, String(a))).rejects.toThrow('ya se vendió');
    await escanear(db, u, o2.id, String(b));
    await expect(cancelarOrden(db, u, o2.id, 'No vino el camión')).resolves.toBeUndefined();
    expect(await db('ventas').where({ orden_id: o2.id }).count('* as c').first()).toMatchObject({ c: 0 });
    const o3 = await orden([{ varianteId: roj, alto: 7, cantidad: 1 }], 'cuenta1');
    expect(await escanear(db, u, o3.id, String(b))).toMatchObject({ completa: true }); // volvió al stock al cancelar
  });

  it('reparto por pallet: siempre suma los maples cargados', () => {
    expect(repartirCuentas(2520, 'mixta', 33)).toEqual({ cuenta1: 832, cuenta2: 1688 });
    expect(repartirCuentas(2520, 'cuenta1', null)).toEqual({ cuenta1: 2520, cuenta2: 0 });
    expect(repartirCuentas(2520, 'cuenta2', 50)).toEqual({ cuenta1: 0, cuenta2: 2520 });
  });
});
