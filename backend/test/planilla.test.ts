import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db.js';
import { cargarProduccion, cargarVenta, minutosEntre, resumenDelDia } from '../src/features/planilla.js';
import { crearPalet } from '../src/features/produccion.service.js';

describe('planilla del día (moldeados_test)', () => {
  let u: string, variante: string, cliente: string;
  const fecha = '2026-11-11';
  const base = { fecha, turno: 'manana' as const, empleadoIds: [] as string[] };

  beforeEach(async () => {
    await db.raw('truncate pedido_items, pedidos, movimientos_dinero, venta_items, ventas, precios_cliente, clientes, palet_lotes, palets, parte_consumos, parte_empleados, partes, receta_items, variantes, maquinas, empleados, auditoria, usuarios cascade');
    [{ id: u }] = await db('usuarios').insert({ nombre: 'Socio', usuario: 'socio', password_hash: 'x', rol: 'dueno' }).returning('id');
    const [{ id: maq }] = await db('maquinas').insert({ codigo: 'MP-2', nombre: 'Grande' }).returning('id');
    [{ id: variante }] = await db('variantes').insert({ codigo: 'MGR-NAT', nombre: 'Grande natural', tamano: 'grande', maquina_id: maq, precio_maple_centavos: 11000 }).returning('id');
    [{ id: cliente }] = await db('clientes').insert({ nombre: 'Avícola Santa Rosa' }).returning('id');
  });
  afterAll(() => db.destroy());

  it('horas entre comienzo y parada, también pasando la medianoche', () => {
    expect(minutosEntre('06:00', '14:00')).toBe(480);
    expect(minutosEntre('22:00', '06:00')).toBe(480);
    expect(minutosEntre('06:00', '06:00')).toBe(0);
  });

  it('lo fabricado se guarda como parte en paquetes (palets × alto × 6), sin personal', async () => {
    await cargarProduccion(db, u, { ...base, varianteId: variante, inicio: '06:00', fin: '14:00', palets: 2, alto: 6 });
    const p = await db('partes').first('paquetes', 'minutos');
    expect(p).toMatchObject({ paquetes: 72, minutos: 480 });
    expect(await db('palets').count('id as c').first()).toMatchObject({ c: 0 }); // los palets se arman al vender
  });

  it('venta: arma el palet a medida y lo vende a precio de lista; el resto queda en la fábrica', async () => {
    await cargarProduccion(db, u, { ...base, varianteId: variante, inicio: '06:00', fin: '14:00', palets: 2, alto: 6 });
    await cargarVenta(db, u, { fecha, clienteId: cliente, varianteId: variante, palets: 1, alto: 6, conFactura: false, retira: null });
    const v = await db('ventas').first('total_centavos', 'retira');
    expect(v).toMatchObject({ total_centavos: 23760000, retira: 'Avícola Santa Rosa' }); // 36 paq × 60 × $110
    const r = await resumenDelDia(db, fecha);
    expect(r.stock.find((s) => s.codigo === 'MGR-NAT')?.paquetes).toBe(36);
    expect(r.ventas[0]).toMatchObject({ palets: 1, maples: 2160 });
  });

  it('si hace falta, desarma un palet ya armado (8 de alto para entregar 6: quedan 2 de alto libres)', async () => {
    await cargarProduccion(db, u, { ...base, varianteId: variante, inicio: '06:00', fin: '14:00', palets: 1, alto: 8 });
    await crearPalet(db, u, { varianteId: variante, ancho: 2, largo: 3, alto: 8, vehiculo: null, destino: null, notas: null });
    await cargarVenta(db, u, { fecha, clienteId: cliente, varianteId: variante, palets: 1, alto: 6, conFactura: false, retira: null });
    const desarmado = await db('palets').where({ alto: 8 }).first('anulado_at', 'motivo_anulacion');
    expect(desarmado?.anulado_at).not.toBeNull();
    expect(desarmado?.motivo_anulacion).toBe('Desarmado para la entrega a Avícola Santa Rosa');
    expect((await resumenDelDia(db, fecha)).stock[0]?.paquetes).toBe(12); // 2 de alto
  });

  it('si no alcanza, avisa cuánto hay y no guarda nada', async () => {
    await cargarProduccion(db, u, { ...base, varianteId: variante, inicio: '06:00', fin: '14:00', palets: 1, alto: 4 });
    await expect(cargarVenta(db, u, { fecha, clienteId: cliente, varianteId: variante, palets: 1, alto: 6, conFactura: false, retira: null }))
      .rejects.toThrow('hacen falta 36 paquetes y en la fábrica hay 24 (4 de alto)');
    expect(await db('ventas').count('id as c').first()).toMatchObject({ c: 0 });
    expect(await db('palets').count('id as c').first()).toMatchObject({ c: 0 });
  });
});
