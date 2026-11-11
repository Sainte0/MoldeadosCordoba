import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ocurrencias } from '@moldeados/shared';
import { buildApp } from '../src/app.js';
import { db } from '../src/db.js';
import { firmar } from '../src/lib/auth.js';
import { revisarRecordatorios } from '../src/features/agenda.js';

describe('repeticiones', () => {
  it('una vez, diario, semanal y mensual (con meses cortos)', () => {
    expect(ocurrencias({ fecha: '2026-11-04', repetir: 'no' }, '2026-11-01', '2026-11-30')).toEqual(['2026-11-04']);
    expect(ocurrencias({ fecha: '2026-11-04', repetir: 'no' }, '2026-11-05', '2026-11-30')).toEqual([]);
    expect(ocurrencias({ fecha: '2026-11-04', repetir: 'diario' }, '2026-11-06', '2026-11-08')).toEqual(['2026-11-06', '2026-11-07', '2026-11-08']);
    expect(ocurrencias({ fecha: '2026-11-04', repetir: 'semanal' }, '2026-11-05', '2026-11-30')).toEqual(['2026-11-11', '2026-11-18', '2026-11-25']);
    expect(ocurrencias({ fecha: '2026-01-31', repetir: 'mensual' }, '2026-02-01', '2026-04-30')).toEqual(['2026-02-28', '2026-03-31', '2026-04-30']);
    expect(ocurrencias({ fecha: '2026-12-10', repetir: 'diario' }, '2026-11-01', '2026-11-30')).toEqual([]); // empieza después
  });
});

describe('agenda (moldeados_test)', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let hoy: string;
  const u: Record<string, { id: string; token: string }> = {};
  const pedir = (quien: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url: `/api${url}`, headers: { authorization: `Bearer ${u[quien]!.token}` }, payload }).then((r) => ({ status: r.statusCode, ...r.json() }));
  const avisos = async (quien: string) => (await pedir(quien, 'GET', '/notificaciones')).data;

  beforeEach(async () => {
    app ??= await buildApp();
    await db.raw('truncate recordatorio_hechos, recordatorio_usuarios, recordatorios, notificaciones, push_suscripciones, auditoria, usuarios cascade');
    for (const [usuario, rol] of [['dueno', 'dueno'], ['ana', 'operario'], ['luis', 'operario'], ['carla', 'operario']] as const) {
      const [r] = await db('usuarios').insert({ nombre: usuario, usuario, password_hash: 'x', rol }).returning('id');
      u[usuario] = { id: r.id, token: firmar({ usuarioId: r.id, rol }) };
    }
    hoy = (await db.raw("select to_char(now(), 'YYYY-MM-DD') as h")).rows[0].h;
  });
  afterAll(async () => { await app.close(); await db.destroy(); });

  it('un recordatorio para dos personas: les avisa a ellas, lo ven ellas y no un tercero', async () => {
    const r = await pedir('dueno', 'POST', '/agenda', { titulo: 'Limpiar moldes MP-2', fecha: hoy, hora: '23:59', usuarios: [u.ana!.id, u.luis!.id] });
    expect(r.status).toBe(201);
    expect((await avisos('ana')).sinLeer).toBe(1);
    expect((await avisos('ana')).lista[0].titulo).toBe('dueno te agendó: Limpiar moldes MP-2');
    expect((await avisos('carla')).sinLeer).toBe(0);
    expect((await avisos('dueno')).sinLeer).toBe(0); // al que lo cargó no le avisa
    expect((await pedir('luis', 'GET', `/agenda?desde=${hoy}`)).data.items).toHaveLength(1);
    expect((await pedir('carla', 'GET', `/agenda?desde=${hoy}`)).data.items).toHaveLength(0);
    // Carla no lo puede marcar ni borrar; Ana no lo puede borrar (no lo creó).
    expect((await pedir('carla', 'POST', `/agenda/${r.data.id}/hecho`, { fecha: hoy })).status).toBe(404);
    expect((await pedir('ana', 'DELETE', `/agenda/${r.data.id}`)).status).toBe(403);
  });

  it('lo marca hecho uno y queda hecho para todos; al creador le avisa', async () => {
    const r = await pedir('dueno', 'POST', '/agenda', { titulo: 'Pedir tinta', fecha: hoy, paraTodos: true });
    expect((await avisos('carla')).sinLeer).toBe(1);
    await pedir('ana', 'POST', `/agenda/${r.data.id}/hecho`, { fecha: hoy });
    const visto = (await pedir('luis', 'GET', `/agenda?desde=${hoy}`)).data.items[0];
    expect(visto.hecho.por).toBe('ana');
    expect((await avisos('dueno')).lista[0].titulo).toBe('ana hizo: Pedir tinta');
  });

  it('el aviso a la hora sale una sola vez, y no sale si ya está hecho', async () => {
    await pedir('dueno', 'POST', '/agenda', { titulo: 'Service compresor', fecha: hoy, hora: '00:00', usuarios: [u.luis!.id] });
    const hecho = await pedir('dueno', 'POST', '/agenda', { titulo: 'Ya hecho', fecha: hoy, hora: '00:00', usuarios: [u.luis!.id] });
    await pedir('luis', 'POST', `/agenda/${hecho.data.id}/hecho`, { fecha: hoy });
    const antes = (await avisos('luis')).lista.length;
    expect(await revisarRecordatorios()).toBe(1);
    expect(await revisarRecordatorios()).toBe(0);
    const l = (await avisos('luis')).lista;
    expect(l.length).toBe(antes + 1);
    expect(l[0].titulo).toBe('Service compresor');
  });

  it('el dueño ve la agenda de una o varias personas; un operario no puede pedir la de otro', async () => {
    await pedir('dueno', 'POST', '/agenda', { titulo: 'Para Ana', fecha: hoy, usuarios: [u.ana!.id] });
    await pedir('dueno', 'POST', '/agenda', { titulo: 'Para Luis', fecha: hoy, usuarios: [u.luis!.id] });
    await pedir('carla', 'POST', '/agenda', { titulo: 'De Carla para ella', fecha: hoy, usuarios: [u.carla!.id] });
    await pedir('dueno', 'POST', '/agenda', { titulo: 'Para todos', fecha: hoy, paraTodos: true });
    const titulos = async (quien: string, q: string) => ((await pedir(quien, 'GET', `/agenda?desde=${hoy}${q}`)).data.items as { titulo: string }[]).map((x) => x.titulo).sort();
    expect(await titulos('dueno', `&de=${u.ana!.id}`)).toEqual(['Para Ana', 'Para todos']);
    expect(await titulos('dueno', `&de=${u.ana!.id},${u.carla!.id}`)).toEqual(['De Carla para ella', 'Para Ana', 'Para todos']);
    expect(await titulos('dueno', '&todos=1')).toHaveLength(4);
    // Luis pide la de Ana: el pedido se ignora y ve solo la suya.
    expect(await titulos('luis', `&de=${u.ana!.id}`)).toEqual(['Para Luis', 'Para todos']);
  });

  it('marcar leídas', async () => {
    await pedir('dueno', 'POST', '/agenda', { titulo: 'X', fecha: hoy, usuarios: [u.ana!.id] });
    await pedir('ana', 'POST', '/notificaciones/leer', {});
    expect((await avisos('ana')).sinLeer).toBe(0);
  });

  it('valida para quién es y la hora', async () => {
    expect((await pedir('dueno', 'POST', '/agenda', { titulo: 'Sin nadie', fecha: hoy })).error.message).toBe('Elegí para quién es');
    expect((await pedir('dueno', 'POST', '/agenda', { titulo: 'Hora rara', fecha: hoy, hora: '25:00', paraTodos: true })).status).toBe(400);
    // Texto de más: dice qué campo acortar, no "Revisá los datos".
    expect((await pedir('dueno', 'POST', '/agenda', { titulo: 'x'.repeat(200), fecha: hoy, paraTodos: true })).error.message).toBe('El título tiene más de 140 letras: acortalo');
  });
});
