import { describe, expect, it } from 'vitest';
import { ritmoCliente, telefonoWhatsapp } from '@moldeados/shared';

describe('ritmo de compra', () => {
  it('cliente que compra cada ~14 días: al día, le toca y dejó de comprar', () => {
    const f = ['2026-09-01', '2026-09-15', '2026-09-29', '2026-10-13'];
    expect(ritmoCliente(f, '2026-10-20')).toMatchObject({ cadaDias: 14, estado: 'al_dia' });
    expect(ritmoCliente(f, '2026-10-26')).toMatchObject({ estado: 'le_toca', diasDesdeUltima: 13 });
    expect(ritmoCliente(f, '2026-11-10')).toMatchObject({ estado: 'dejo' });
  });
  it('compró una sola vez: avisa recién a los 45 días', () => {
    expect(ritmoCliente(['2026-10-01'], '2026-10-30').estado).toBe('al_dia');
    expect(ritmoCliente(['2026-09-01'], '2026-10-30').estado).toBe('dejo');
  });
  it('dos compras el mismo día cuentan como una', () => {
    expect(ritmoCliente(['2026-10-01', '2026-10-01'], '2026-10-02').compras).toBe(1);
  });
});

describe('teléfono para WhatsApp', () => {
  it('normaliza formatos argentinos comunes', () => {
    expect(telefonoWhatsapp('+54 9 351 809-4299')).toBe('5493518094299');
    expect(telefonoWhatsapp('0351 15 809-4299')).toBe('5493518094299');
    expect(telefonoWhatsapp('351 8094299')).toBe('5493518094299');
    expect(telefonoWhatsapp('4299')).toBeNull();
  });
});

import { afterAll } from 'vitest';
import { db } from '../src/db.js';
import { costosYMargen, materiasPorAcabarse } from '../src/features/avisos.service.js';

describe('costo por maple y días de stock (moldeados_test)', () => {
  afterAll(() => db.destroy());
  it('costo = materia prima usada al precio promedio de compra ÷ maples; margen por cliente', async () => {
    await db.raw('truncate caja_movimientos, gastos, movimientos_dinero, venta_items, ventas, precios_cliente, clientes, palet_lotes, palets, parte_consumos, parte_empleados, partes, receta_items, variantes, maquinas, empleados, movimientos_stock, compra_items, compras, materias_primas, proveedores, auditoria, usuarios cascade');
    const [{ id: u }] = await db('usuarios').insert({ nombre: 'T', usuario: 't', password_hash: 'x', rol: 'dueno' }).returning('id');
    const [{ id: prov }] = await db('proveedores').insert({ nombre: 'P' }).returning('id');
    const [{ id: carton }] = await db('materias_primas').insert({ nombre: 'Cartón', tipo: 'carton', unidad: 'kg', dias_aviso: 7 }).returning('id');
    const [{ id: tinta }] = await db('materias_primas').insert({ nombre: 'Tinta', tipo: 'tinta', unidad: 'l' }).returning('id');
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
    const [{ id: compra }] = await db('compras').insert({ tipo: 'compra', proveedor_id: prov, fecha: '2026-01-01', con_factura: true, iva_bp: 2100, neto_centavos: 15_000_000, iva_centavos: 3_150_000, total_centavos: 18_150_000, usuario_id: u }).returning('id');
    // 1.000 kg de cartón a $100/kg y 10 L de tinta a $5.000/L (sin IVA)
    await db('compra_items').insert([
      { compra_id: compra, materia_prima_id: carton, cantidad: 1_000_000, precio_unitario_centavos: 10_000, subtotal_centavos: 10_000_000 },
      { compra_id: compra, materia_prima_id: tinta, cantidad: 10_000, precio_unitario_centavos: 500_000, subtotal_centavos: 5_000_000 },
    ]);
    await db('movimientos_stock').insert([{ materia_prima_id: carton, cantidad: 600_000, motivo: 'compra', usuario_id: u }]);
    const [{ id: maq }] = await db('maquinas').insert({ codigo: 'MP-2', nombre: 'G' }).returning('id');
    const [{ id: v }] = await db('variantes').insert({ codigo: 'MGR', nombre: 'G', tamano: 'grande', maquina_id: maq }).returning('id');
    const [{ id: parte }] = await db('partes').insert({ fecha: hoy, turno: 'manana', maquina_id: maq, variante_id: v, minutos: 60, paquetes: 10, maples_por_paquete: 60, maples_por_hora: 0, usuario_id: u }).returning('id');
    await db('parte_consumos').insert([{ parte_id: parte, materia_prima_id: carton, teorico: 0, real: 500_000 }, { parte_id: parte, materia_prima_id: tinta, teorico: 0, real: 2_000 }]);
    const [{ id: cli }] = await db('clientes').insert({ nombre: 'Granja' }).returning('id');
    const [{ id: venta }] = await db('ventas').insert({ cliente_id: cli, fecha: hoy, con_factura: false, neto_centavos: 9_000_000, iva_centavos: 0, total_centavos: 9_000_000, usuario_id: u }).returning('id');
    const [{ id: palet }] = await db('palets').insert({ variante_id: v, ancho: 1, largo: 1, alto: 10, paquetes: 10, usuario_id: u }).returning('id');
    await db('venta_items').insert({ venta_id: venta, palet_id: palet, variante_id: v, maples: 600, precio_maple_centavos: 15_000, subtotal_centavos: 9_000_000 });

    const r = await costosYMargen(db, hoy, hoy);
    // (500 kg × $100 + 2 L × $5.000) ÷ 600 maples = $100 por maple; se vende a $150
    expect(r.porCodigo[0]).toMatchObject({ costoMaple: 10_000, precioMaple: 15_000, maplesVendidos: 600, faltaPrecio: false });
    expect(r.porCliente[0]).toMatchObject({ nombre: 'Granja', margen: 3_000_000 });

    // Cartón: 600 kg en stock, se usaron 500 kg en 30 días → alcanza 36 días; con aviso a 40 días aparece.
    await db('materias_primas').where({ id: carton }).update({ dias_aviso: 40 });
    const pocas = await materiasPorAcabarse(db);
    expect(pocas.find((m) => m.id === carton)).toMatchObject({ dias: 36 });
  });
});
