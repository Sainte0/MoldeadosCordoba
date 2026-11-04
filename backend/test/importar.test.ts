import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { aMili } from '@moldeados/shared';
import { buildApp } from '../src/app.js';
import { db } from '../src/db.js';
import { firmar } from '../src/lib/auth.js';
import { saldos } from '../src/features/ventas.service.js';

describe('importar planillas (moldeados_test)', () => {
  let token: string;
  let app: Awaited<ReturnType<typeof buildApp>>;
  const importar = (tipo: string, body: object) =>
    app.inject({ method: 'POST', url: `/api/importar/${tipo}`, headers: { authorization: `Bearer ${token}` }, payload: body }).then((r) => ({ status: r.statusCode, ...r.json() }));
  const stock = async (nombre: string) => Number((await db('movimientos_stock as m').join('materias_primas as p', 'p.id', 'm.materia_prima_id').where('p.nombre', nombre).sum('m.cantidad as s').first())?.s ?? 0);

  beforeEach(async () => {
    app ??= await buildApp();
    await db.raw('truncate solicitudes_idempotentes, pedido_items, pedidos, servicios_maquina, saldos_iniciales, caja_movimientos, gastos, movimientos_dinero, venta_items, ventas, precios_cliente, clientes, palet_lotes, palets, receta_items, variantes, maquinas, parte_consumos, parte_empleados, partes, movimientos_stock, compra_items, compras, materias_primas, proveedores, auditoria, usuarios cascade');
    const [u] = await db('usuarios').insert({ nombre: 'T', usuario: 't', password_hash: 'x', rol: 'dueno' }).returning('id');
    token = firmar({ usuarioId: u.id, rol: 'dueno' });
  });
  afterAll(async () => { await app.close(); await db.destroy(); });

  it('una celda numérica de Excel no pasa por la regla del punto de miles', () => {
    expect(aMili(1.234)).toBe(1_234); // 1,234 kg
    expect(aMili('1.234')).toBe(1_234_000); // escrito a mano: mil doscientos treinta y cuatro
  });

  it('probar no guarda nada; con un error no se importa ninguna fila', async () => {
    const filas = [{ nombre: 'Granja Uno', telefono: '351 1111111' }, { nombre: 'Granja Dos', cuit: '123' }];
    const prueba = await importar('clientes', { modo: 'probar', filas });
    expect(prueba.data.errores).toEqual([{ fila: 3, mensaje: 'El CUIT "123" no es válido' }]);
    const real = await importar('clientes', { modo: 'importar', filas });
    expect(real.status).toBe(400);
    expect(await db('clientes').count('* as n').first()).toMatchObject({ n: 0 });
  });

  it('clientes: crea, y reimportar no duplica (actualiza solo si se pide)', async () => {
    const filas = [{ nombre: 'Granja Uno' }, { nombre: 'granja uno ' }];
    expect((await importar('clientes', { modo: 'probar', filas })).data.errores[0].mensaje).toContain('repetido');
    expect((await importar('clientes', { modo: 'importar', filas: [{ nombre: 'Granja Uno' }] })).data.nuevos).toBe(1);
    const otra = await importar('clientes', { modo: 'importar', actualizar: true, filas: [{ nombre: 'GRANJA UNO', telefono: '351 2222222' }] });
    expect([otra.data.nuevos, otra.data.actualizados]).toEqual([0, 1]);
    expect(await db('clientes').pluck('telefono')).toEqual(['351 2222222']);
  });

  it('stock inicial deja el stock en lo que dice la planilla (reimportar no suma de nuevo)', async () => {
    const filas = [{ materia: 'Cartón', cantidad: '12.500' }, { materia: 'Tinta roja', cantidad: 80.5, unidad: 'L' }];
    expect((await importar('stock', { modo: 'importar', filas })).data.nuevos).toBe(2);
    await importar('stock', { modo: 'importar', filas: [{ materia: 'carton', cantidad: 10000 }] });
    expect([await stock('Cartón'), await stock('Tinta roja')]).toEqual([10_000_000, 80_500]);
  });

  it('saldos iniciales: crean al cliente si no existe y suman a su cuenta corriente', async () => {
    const r = await importar('saldos-clientes', { modo: 'importar', filas: [{ nombre: 'Avícola Sur', saldo: '150.000,50', fecha: '31/10/2026' }, { nombre: 'Otra', saldo: 'mucho' }] });
    expect(r.status).toBe(400); // la segunda fila frena todo
    await importar('saldos-clientes', { modo: 'importar', filas: [{ nombre: 'Avícola Sur', saldo: '150.000,50', fecha: '31/10/2026' }] });
    // Subirla de nuevo no duplica la deuda.
    expect((await importar('saldos-clientes', { modo: 'importar', filas: [{ nombre: 'avicola sur', saldo: '150.000,50', fecha: '31/10/2026' }] })).data.sinCambios).toBe(1);
    const s = (await saldos(db, 'cliente'))[0]!;
    expect([s.nombre, Number(s.debe) - Number(s.haber)]).toEqual(['Avícola Sur', 15_000_050]);
    expect(await db('saldos_iniciales').first('fecha')).toMatchObject({ fecha: '2026-10-31' });
  });

  it('reenvío sin señal: la misma clave no carga dos veces y devuelve la misma respuesta', async () => {
    const h = { authorization: `Bearer ${token}`, 'idempotency-key': `carga-${Date.now()}-telefono` };
    const enviar = () => app.inject({ method: 'POST', url: '/api/clientes', headers: h, payload: { nombre: 'Granja Offline' } });
    const [a, b] = [await enviar(), await enviar()];
    expect([a.statusCode, b.statusCode]).toEqual([201, 201]);
    expect(b.json().data.id).toBe(a.json().data.id);
    expect(b.headers['idempotent-replay']).toBe('true');
    expect(await db('clientes').count('* as n').first()).toMatchObject({ n: 1 });
  });

  it('ventas anteriores de la planilla: sin palet, IVA separado en las facturadas, lo pagado como cobros y el remito sigue la numeración', async () => {
    await db.raw("select setval('ventas_numero_seq', 1, false)"); // el truncate no reinicia la numeración
    const [{ id: maq }] = await db('maquinas').insert({ codigo: 'MP-2', nombre: 'Grande' }).returning('id');
    await db('variantes').insert({ codigo: 'MGR-NAT', nombre: 'Grande natural', tamano: 'grande', maquina_id: maq });
    const filas = [
      { fecha: '04/08/2026', comprobante: '295', calidad: 'Primera', cantidad: '6.480', precio: '$ 120,00', monto: '$ 777.600', efectivo: '$ 777.600', estado: 'Cobrado', registro: 'yo' },
      { fecha: '04/08/2026', comprobante: '296', calidad: 'Segunda', cantidad: '7.560', precio: '$ 100,00', monto: '$ 756.000', estado: 'Pendiente' },
      { fecha: '13/08/2026', comprobante: 'A-141', cliente: 'Avícola Santa Rosa', calidad: 'Primera', cantidad: '25.920', precio: '133,1', monto: '$ 3.449.952', transferencia: '3449952', estado: 'Cobrado' },
      { fecha: '10/08/2026', comprobante: '299', calidad: 'Primera', cantidad: '1.800', precio: '110', monto: '$ 198.000', efectivo: '198000', estado: 'Pendiente' },
      { monto: '$0', estado: 'Pendiente' },
    ];
    const r = await importar('ventas', { modo: 'importar', filas });
    expect([r.status, r.data.nuevos]).toEqual([200, 4]);
    const v = await db('ventas').orderBy('fecha').select('numero', 'con_factura', 'neto_centavos', 'iva_centavos', 'total_centavos');
    expect(v.map((x) => Number(x.numero)).sort((a, b) => a - b)).toEqual([295, 296, 299, 300]); // la factura sin remito va después
    const fac = v.find((x) => x.con_factura)!;
    expect([Number(fac.neto_centavos) + Number(fac.iva_centavos), Number(fac.neto_centavos)]).toEqual([344_995_200, Math.round(344_995_200 / 1.21)]);
    // Cobros: 295 en efectivo y la factura por transferencia; la 299 "Pendiente" no se registra como cobrada.
    expect(Number((await db('movimientos_dinero').sum('monto_centavos as s').first())?.s)).toBe(77_760_000 + 344_995_200);
    expect(await db('venta_items').whereNull('palet_id').count('* as n').first()).toMatchObject({ n: 4 });
    expect((await db('venta_items').where({ calidad: 'segunda' }).first()).maples).toBe(7560);
    expect((await importar('ventas', { modo: 'importar', filas })).data.sinCambios).toBe(4);
    const [{ nextval }] = (await db.raw("select nextval('ventas_numero_seq')")).rows;
    expect(Number(nextval)).toBe(301);
  });

  it('egresos de la planilla: crea categorías, deja pendientes y reimportar no duplica', async () => {
    const filas = [
      { fecha: '04/08/2026', comprobante: 'A-3169', beneficiario: 'ELECTRO ALEM', descripcion: 'MAT ELECTRICOS', categoria: 'Mantenimiento', forma: 'Cheque', monto: 159500, estado: 'Pagado' },
      { fecha: '10/08/2026', comprobante: 'F-931 07-2026', beneficiario: 'ARCA', descripcion: 'Cargas Soc', categoria: 'Impuestos', forma: 'Transferencia', monto: '4.043.420', estado: 'Pendiente' },
      { fecha: '07/08/2026', beneficiario: 'DYNATECH', descripcion: 'TINTA', categoria: 'Tinta', forma: 'Transferencia', monto: 6074170, usd: 'US$ 4.053,50', estado: 'Pagado' },
      { descripcion: '', monto: '$0' }, // renglón vacío de la planilla
    ];
    const r = await importar('egresos', { modo: 'importar', filas });
    expect([r.status, r.data.nuevos]).toEqual([200, 3]);
    const g = await db('gastos as g').join('categorias_gasto as k', 'k.id', 'g.categoria_id').orderBy('g.fecha').select('k.nombre', 'g.a_pagar', 'g.medio', 'g.monto_centavos', 'g.monto_usd_centavos');
    expect(g.map((x) => [x.nombre, x.a_pagar, x.medio])).toEqual([['Mantenimiento y repuestos', false, 'cheque'], ['Tinta', false, 'transferencia'], ['Impuestos', true, null]]);
    expect([Number(g[1].monto_usd_centavos), Number(g[2].monto_centavos)]).toEqual([405_350, 404_342_000]);
    expect((await importar('egresos', { modo: 'importar', filas })).data.sinCambios).toBe(3);
  });

  it('el listado de palets dice cuáles están vendidos (no los muestra como listos para salir)', async () => {
    const u = (await db('usuarios').first('id')).id;
    const [{ id: maq }] = await db('maquinas').insert({ codigo: 'MPX', nombre: 'X' }).returning('id');
    const [{ id: v }] = await db('variantes').insert({ codigo: 'TST', nombre: 'Test', tamano: 'grande', maquina_id: maq }).returning('id');
    const [{ id: c }] = await db('clientes').insert({ nombre: 'Granja Test' }).returning('id');
    const [{ id: venta }] = await db('ventas').insert({ cliente_id: c, fecha: '2026-11-04', con_factura: false, neto_centavos: 1, iva_centavos: 0, total_centavos: 1, usuario_id: u }).returning('id');
    await db('palets').insert([{ variante_id: v, ancho: 1, largo: 1, alto: 1, paquetes: 1, usuario_id: u, venta_id: venta }, { variante_id: v, ancho: 1, largo: 1, alto: 1, paquetes: 1, usuario_id: u }]);
    const r = await app.inject({ method: 'GET', url: '/api/palets', headers: { authorization: `Bearer ${token}` } });
    const lista = r.json().data as { ventaId: string | null; cliente: string | null }[];
    expect(lista.filter((p) => p.ventaId)).toEqual([expect.objectContaining({ cliente: 'Granja Test' })]);
    const listos = await app.inject({ method: 'GET', url: '/api/palets?estado=listos', headers: { authorization: `Bearer ${token}` } });
    expect(listos.json().data).toHaveLength(1);
    // La dirección del palet usa el número (/palets/12); el id largo de las etiquetas viejas sigue andando.
    const { id, numero } = listos.json().data[0] as { id: string; numero: number };
    const ver = (x: string) => app.inject({ method: 'GET', url: `/api/palets/${x}`, headers: { authorization: `Bearer ${token}` } }).then((q) => ({ status: q.statusCode, id: q.json().data?.id }));
    expect(await ver(String(numero))).toEqual({ status: 200, id });
    expect(await ver(id)).toEqual({ status: 200, id });
    expect((await ver('999999')).status).toBe(404);
  });
});
