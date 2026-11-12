import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { cajaSchema, gastoSchema } from '@moldeados/shared';
import { db } from '../src/db.js';
import { anularGasto, balanceAnual, crearGasto, pagarGasto, saldoCaja, tablero } from '../src/features/gastos.service.js';
import { armarResumen, toca } from '../src/features/resumen.js';

describe('gastos, caja chica y tablero (moldeados_test)', () => {
  let u: string, cat: string, cliente: string, prov: string;

  beforeEach(async () => {
    await db.raw('truncate caja_movimientos, gastos, archivos, movimientos_dinero, venta_items, ventas, precios_cliente, clientes, palet_lotes, palets, parte_consumos, parte_empleados, partes, movimientos_stock, compra_items, compras, proveedores, auditoria, usuarios cascade');
    [{ id: u }] = await db('usuarios').insert({ nombre: 'Test', usuario: 'test', password_hash: 'x', rol: 'dueno' }).returning('id');
    cat = (await db('categorias_gasto').where({ nombre: 'Caja chica' }).first('id')).id;
    [{ id: cliente }] = await db('clientes').insert({ nombre: 'Granja' }).returning('id');
    [{ id: prov }] = await db('proveedores').insert({ nombre: 'Reciclados' }).returning('id');
  });
  afterAll(() => db.destroy());

  const gasto = (monto: number, medio: string, fecha = '2026-11-03') =>
    crearGasto(db, u, gastoSchema.parse({ fecha, categoriaId: cat, descripcion: 'Guantes', monto, medio }));

  it('un egreso pendiente no toca la caja hasta que se paga; pagarlo dos veces no se puede', async () => {
    await db('caja_movimientos').insert({ fecha: '2026-11-01', monto_centavos: 100_000, motivo: 'reposicion', concepto: 'x', usuario_id: u });
    const g = await crearGasto(db, u, gastoSchema.parse({ fecha: '2026-11-03', categoriaId: cat, descripcion: 'F-931', monto: 30_000, medio: 'efectivo', aPagar: true, vencimiento: '2026-11-10', beneficiario: 'ARCA' }));
    const fila = await db('gastos').where({ id: g.id }).first();
    expect([fila.a_pagar, fila.medio, fila.beneficiario]).toEqual([true, null, 'ARCA']);
    expect(await saldoCaja(db)).toBe(100_000);
    await pagarGasto(db, u, g.id, { medio: 'caja_chica', bancoId: null });
    expect(await saldoCaja(db)).toBe(70_000);
    await expect(pagarGasto(db, u, g.id, { medio: 'caja_chica', bancoId: null })).rejects.toThrow('ya figura como pagado');
  });

  it('balance mensual: ingresos, egresos, resultado y saldo acumulado como la planilla', async () => {
    await db('ventas').insert([{ cliente_id: cliente, fecha: '2026-08-10', con_factura: false, neto_centavos: 1, iva_centavos: 0, total_centavos: 1_000_000, usuario_id: u },
      { cliente_id: cliente, fecha: '2026-09-10', con_factura: false, neto_centavos: 1, iva_centavos: 0, total_centavos: 500_000, usuario_id: u }]);
    await gasto(1_500_000, 'transferencia', '2026-08-20');
    const b = await balanceAnual(db, 2026);
    expect(b[7]).toMatchObject({ mes: 8, ingresos: 1_000_000, egresos: 1_500_000, resultado: -500_000, acumulado: -500_000 });
    expect(b[8]).toMatchObject({ mes: 9, ingresos: 500_000, resultado: 500_000, acumulado: 0, variacion: 200 });
  });

  it('un gasto con caja chica la descuenta y anularlo la devuelve; con transferencia no la toca', async () => {
    await db('caja_movimientos').insert({ fecha: '2026-11-01', monto_centavos: 5_000_000, motivo: 'reposicion', concepto: 'Inicio', usuario_id: u });
    const g = await gasto(1_200_000, 'caja_chica');
    await gasto(9_900_000, 'transferencia');
    expect(await saldoCaja(db)).toBe(3_800_000);
    await anularGasto(db, u, g.id, 'Se cargó mal');
    expect(await saldoCaja(db)).toBe(5_000_000);
    await expect(anularGasto(db, u, g.id, 'otra')).rejects.toThrow('ya estaba anulado');
  });

  it('la reposición de caja tiene que ser positiva; el arqueo puede restar', () => {
    expect(cajaSchema.safeParse({ fecha: '2026-11-03', motivo: 'reposicion', monto: -100, concepto: 'x' }).success).toBe(false);
    expect(cajaSchema.safeParse({ fecha: '2026-11-03', motivo: 'arqueo', monto: -100, concepto: 'Faltante' }).success).toBe(true);
  });

  it('tablero: resultado = ventas − compras − gastos del período; lo anulado y lo de afuera no cuenta', async () => {
    const venta = (fecha: string, total: number, anulado = false) => db('ventas').insert({ cliente_id: cliente, fecha, con_factura: false, neto_centavos: total, iva_centavos: 0, total_centavos: total, usuario_id: u, anulado_at: anulado ? db.fn.now() : null });
    await venta('2026-11-02', 10_000_000);
    await venta('2026-11-03', 5_000_000, true);
    await venta('2026-10-31', 99_000_000); // fuera del período
    await db('compras').insert({ tipo: 'compra', proveedor_id: prov, fecha: '2026-11-02', con_factura: true, neto_centavos: 3_000_000, iva_centavos: 0, total_centavos: 3_000_000, usuario_id: u });
    await gasto(1_000_000, 'efectivo', '2026-11-03');
    await db('movimientos_dinero').insert({ tipo: 'cobro', cliente_id: cliente, fecha: '2026-11-03', monto_centavos: 4_000_000, medio: 'efectivo', usuario_id: u });

    const t = await tablero(db, '2026-11-01', '2026-11-07');
    expect([t.ventas.total, t.compras.total, t.gastos.total, t.resultado]).toEqual([10_000_000, 3_000_000, 1_000_000, 6_000_000]);
    expect(t.porCobrar).toBe(109_000_000 - 4_000_000); // saldo histórico, no del período
    expect(t.serie).toHaveLength(7);
    expect(t.serie.find((s) => s.inicio === '2026-11-02')).toMatchObject({ ingresos: 10_000_000, egresos: 3_000_000 });
    expect((await tablero(db, '2026-01-01', '2026-11-07')).paso).toBe('week');
  });

  it('resumen diario: una sola vez por día, desde la hora elegida; con lo del día y los avisos', async () => {
    expect(toca(20, 19, null, '2026-11-04')).toBe(false);
    expect(toca(20, 20, '2026-11-03', '2026-11-04')).toBe(true);
    expect(toca(20, 23, '2026-11-04', '2026-11-04')).toBe(false);
    await db('ventas').insert({ cliente_id: cliente, fecha: '2026-11-04', con_factura: false, neto_centavos: 9_000_000, iva_centavos: 0, total_centavos: 9_000_000, usuario_id: u });
    await db('movimientos_dinero').insert({ tipo: 'pago', proveedor_id: prov, fecha: '2026-11-01', monto_centavos: 2_500_000, medio: 'echeq', banco_id: (await db('bancos').first('id')).id, cheque_numero: '1', cheque_fecha_cobro: '2026-11-05', usuario_id: u });
    const r = await armarResumen(db, '2026-11-04');
    expect(r.texto).toContain('*Ventas:* 1 venta,');
    expect(r.texto).toContain('Granja: $');
    expect(r.texto).toContain('Cheque nuestro a cubrir el 05/11');
    expect(r.texto).toContain('sin producción cargada');
  });
});
