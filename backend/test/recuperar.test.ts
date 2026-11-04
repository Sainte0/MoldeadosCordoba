import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';

// Los mails no salen: se guardan acá para leer el código.
const enviados: { para: string[]; asunto: string; texto: string }[] = [];
vi.mock('../src/lib/mail.js', () => ({ enviarMail: async (m: { para: string[]; asunto: string; texto: string }) => { enviados.push(m); } }));

const { buildApp } = await import('../src/app.js');
const { db } = await import('../src/db.js');

describe('recuperar la contraseña con código por mail (moldeados_test)', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  const post = (url: string, payload: object) => app.inject({ method: 'POST', url: `/api${url}`, payload }).then((r) => ({ status: r.statusCode, ...r.json() }));
  const codigo = () => /\b(\d{6})\b/.exec(enviados.at(-1)!.texto)![1]!;

  beforeEach(async () => {
    // App nueva en cada caso: el límite de pedidos por minuto es por app y si no se acumula entre casos.
    if (app) await app.close();
    app = await buildApp();
    enviados.length = 0;
    await db.raw('truncate codigos_recuperacion, auditoria, usuarios cascade');
    await db('usuarios').insert([
      { nombre: 'Ana Gómez', usuario: 'ana', email: 'ana@planta.com', password_hash: await bcrypt.hash('vieja123', 4), rol: 'operario' },
      { nombre: 'Sin Mail', usuario: 'sinmail', password_hash: await bcrypt.hash('x', 4), rol: 'operario' },
    ]);
  });
  afterAll(async () => { await app.close(); await db.destroy(); });

  it('manda el código por mail (por usuario o por mail) y responde igual exista o no', async () => {
    expect((await post('/auth/recuperar', { usuario: 'ANA' })).data).toEqual({ ok: true });
    expect(enviados[0]!.para).toEqual(['ana@planta.com']);
    expect(await post('/auth/recuperar', { usuario: 'ana@planta.com' })).toMatchObject({ status: 200 });
    expect(enviados).toHaveLength(2);
    // Usuario que no existe o sin mail: misma respuesta y no sale nada.
    expect((await post('/auth/recuperar', { usuario: 'nadie' })).data).toEqual({ ok: true });
    expect((await post('/auth/recuperar', { usuario: 'sinmail' })).data).toEqual({ ok: true });
    expect(enviados).toHaveLength(2);
  });

  it('con el código cambia la contraseña; sirve una sola vez y el anterior queda anulado', async () => {
    await post('/auth/recuperar', { usuario: 'ana' });
    const viejo = codigo();
    await post('/auth/recuperar', { usuario: 'ana' });
    const nuevo = codigo();
    if (viejo !== nuevo) expect((await post('/auth/restablecer', { usuario: 'ana', codigo: viejo, password: 'nueva123' })).status).toBe(400);
    expect((await post('/auth/restablecer', { usuario: 'ana', codigo: nuevo, password: 'nueva123' })).data).toEqual({ ok: true, usuario: 'ana' });
    expect((await post('/auth/login', { usuario: 'ana', password: 'nueva123' })).status).toBe(200);
    expect((await post('/auth/restablecer', { usuario: 'ana', codigo: nuevo, password: 'otra1234' })).error.message).toContain('Pedí uno nuevo');
  });

  it('después de 5 intentos equivocados el código se bloquea', async () => {
    await post('/auth/recuperar', { usuario: 'ana' });
    const bueno = codigo();
    const malo = bueno === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) expect((await post('/auth/restablecer', { usuario: 'ana', codigo: malo, password: 'nueva123' })).error.message).toContain('no es correcto');
    expect((await post('/auth/restablecer', { usuario: 'ana', codigo: bueno, password: 'nueva123' })).error.message).toContain('Demasiados intentos');
  });
});
