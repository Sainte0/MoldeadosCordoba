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
    await db.raw('truncate saldos_iniciales, caja_movimientos, gastos, movimientos_dinero, venta_items, ventas, precios_cliente, clientes, palet_lotes, palets, parte_consumos, parte_empleados, partes, movimientos_stock, compra_items, compras, materias_primas, proveedores, auditoria, usuarios cascade');
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
});
