import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { randomInt } from 'node:crypto';
import { instructivoSchema, loginSchema, recuperarSchema, restablecerSchema, usuarioSchema, permisoSchema, type Rol } from '@moldeados/shared';
import { enviarMail } from '../lib/mail.js';
import { db } from '../db.js';
import { firmar, invalidarPermisos, matriz, requerir, sesion } from '../lib/auth.js';
import { auditar } from '../lib/auditoria.js';
import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from '../lib/errors.js';

// Login, sesión actual, equipo (usuarios) y matriz de permisos por rol.
// ponytail: CRUD chico sin capa repository aparte; partir si crece lógica de negocio acá.

const COLS = ['id', 'nombre', 'usuario', 'rol', 'activo', 'email'] as const;
const VENCE_MIN = 15;
const MAX_INTENTOS = 5;

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const { usuario, password } = loginSchema.parse(req.body);
    const u = await db('usuarios').whereRaw('lower(usuario) = ?', [usuario]).whereNull('deleted_at').first([...COLS, 'password_hash']);
    if (!u || !u.activo || !(await bcrypt.compare(password, u.password_hash))) {
      throw new UnauthorizedError('Usuario o contraseña incorrectos');
    }
    await auditar(db, { usuarioId: u.id, accion: 'login', entidad: 'usuario', entidadId: u.id });
    const { password_hash: _, ...usuarioPublico } = u;
    return { data: { token: firmar({ usuarioId: u.id, rol: u.rol as Rol }), usuario: usuarioPublico, permisos: (await matriz(db))[u.rol as Rol] } };
  });

  // Recuperar la contraseña: se manda un código de 6 números al mail del usuario. La respuesta es siempre la misma
  // (exista o no el usuario, tenga o no mail): así no sirve para averiguar qué usuarios hay.
  app.post('/auth/recuperar', { config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } }, async (req) => {
    const { usuario } = recuperarSchema.parse(req.body);
    const u = await db('usuarios').whereNull('deleted_at').where({ activo: true })
      .where((w) => w.whereRaw('lower(usuario) = ?', [usuario]).orWhereRaw('lower(email) = ?', [usuario])).first('id', 'nombre', 'email');
    if (u?.email) {
      const codigo = String(randomInt(0, 1_000_000)).padStart(6, '0');
      await db.transaction(async (trx) => {
        // Pedir uno nuevo anula los anteriores.
        await trx('codigos_recuperacion').where({ usuario_id: u.id }).whereNull('usado_at').update({ usado_at: trx.fn.now() });
        await trx('codigos_recuperacion').insert({ usuario_id: u.id, codigo_hash: await bcrypt.hash(codigo, 8), expira_at: trx.raw(`now() + interval '${VENCE_MIN} minutes'`) });
      });
      try {
        await enviarMail({
          para: [u.email], asunto: `Tu código para entrar: ${codigo}`,
          texto: `Hola ${u.nombre.split(' ')[0]}:\n\nTu código para cambiar la contraseña de Moldeados Córdoba es:\n\n*${codigo}*\n\nVence en ${VENCE_MIN} minutos. Si no lo pediste vos, ignorá este mail: tu contraseña no cambia.`,
        });
      } catch (e) {
        req.log.error({ err: e }, 'No se pudo mandar el código de recuperación');
        throw new ValidationError('No pudimos mandar el mail. Probá de nuevo en unos minutos.');
      }
    }
    return { data: { ok: true } };
  });

  app.post('/auth/restablecer', { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (req) => {
    const { usuario, codigo, password } = restablecerSchema.parse(req.body);
    const u = await db('usuarios').whereNull('deleted_at').where({ activo: true })
      .where((w) => w.whereRaw('lower(usuario) = ?', [usuario]).orWhereRaw('lower(email) = ?', [usuario])).first([...COLS]);
    const c = u && await db('codigos_recuperacion').where({ usuario_id: u.id }).whereNull('usado_at').where('expira_at', '>', db.fn.now())
      .orderBy('created_at', 'desc').first('id', 'codigo_hash', 'intentos');
    if (!u || !c) throw new ValidationError('El código venció o no es válido. Pedí uno nuevo.');
    if (c.intentos >= MAX_INTENTOS) throw new ValidationError('Demasiados intentos con ese código. Pedí uno nuevo.');
    if (!(await bcrypt.compare(codigo, c.codigo_hash))) {
      await db('codigos_recuperacion').where({ id: c.id }).increment('intentos', 1);
      throw new ValidationError('El código no es correcto. Revisá el mail (el último que te llegó).');
    }
    await db.transaction(async (trx) => {
      await trx('codigos_recuperacion').where({ id: c.id }).update({ usado_at: trx.fn.now() });
      await trx('usuarios').where({ id: u.id }).update({ password_hash: await bcrypt.hash(password, 10), updated_at: trx.fn.now() });
      await auditar(trx, { usuarioId: u.id, accion: 'editar', entidad: 'usuario', entidadId: u.id, motivo: 'Cambió la contraseña con el código por mail' });
    });
    return { data: { ok: true, usuario: u.usuario } };
  });

  app.get('/auth/yo', async (req) => {
    const s = sesion(req);
    const u = await db('usuarios').where({ id: s.usuarioId, activo: true }).whereNull('deleted_at').first(COLS);
    if (!u) throw new UnauthorizedError();
    // Token renovado: así la sesión no vence mientras la persona siga usando el sistema.
    return { data: { token: firmar({ usuarioId: u.id, rol: u.rol as Rol }), usuario: u, permisos: (await matriz(db))[u.rol as Rol] } };
  });

  app.get('/usuarios', async (req) => {
    await requerir(db, req, 'usuarios', 1);
    return { data: await db('usuarios').whereNull('deleted_at').orderBy('nombre').select(COLS) };
  });

  app.post('/usuarios', async (req, reply) => {
    const s = await requerir(db, req, 'usuarios', 3);
    const input = usuarioSchema.parse(req.body);
    if (!input.password) throw new ValidationError('Ingresá una contraseña inicial');
    if (input.rol === 'dueno' && s.rol !== 'dueno') throw new ValidationError('Solo el dueño puede crear otro dueño');
    await asegurarUsuarioLibre(input.usuario);
    await asegurarMailLibre(input.email ?? null);
    const [u] = await db.transaction(async (trx) => {
      const filas = await trx('usuarios')
        .insert({ nombre: input.nombre, usuario: input.usuario, rol: input.rol, activo: input.activo, email: input.email ?? null, password_hash: await bcrypt.hash(input.password!, 10) })
        .returning(COLS);
      await auditar(trx, { usuarioId: s.usuarioId, accion: 'crear', entidad: 'usuario', entidadId: filas[0].id, despues: filas[0] });
      return filas;
    });
    return reply.code(201).send({ data: u });
  });

  app.put<{ Params: { id: string } }>('/usuarios/:id', async (req) => {
    const s = await requerir(db, req, 'usuarios', 3);
    const input = usuarioSchema.parse(req.body);
    const antes = await db('usuarios').where({ id: req.params.id }).whereNull('deleted_at').first(COLS);
    if (!antes) throw new NotFoundError('No encontramos ese usuario');
    if ((antes.rol === 'dueno' || input.rol === 'dueno') && s.rol !== 'dueno') throw new ValidationError('Solo el dueño puede cambiar a un dueño');
    if (antes.id === s.usuarioId && (!input.activo || input.rol !== antes.rol)) throw new ValidationError('No podés desactivarte ni cambiarte el rol a vos mismo');
    if (input.usuario !== antes.usuario) await asegurarUsuarioLibre(input.usuario);
    if (input.email !== undefined) await asegurarMailLibre(input.email, antes.id);
    const cambios: Record<string, unknown> = { nombre: input.nombre, usuario: input.usuario, rol: input.rol, activo: input.activo, updated_at: db.fn.now() };
    if (input.email !== undefined) cambios.email = input.email;
    if (input.password) cambios.password_hash = await bcrypt.hash(input.password, 10);
    return db.transaction(async (trx) => {
      const [despues] = await trx('usuarios').where({ id: antes.id }).update(cambios).returning(COLS);
      await auditar(trx, { usuarioId: s.usuarioId, accion: 'editar', entidad: 'usuario', entidadId: antes.id, antes, despues, motivo: input.password ? 'Cambio de contraseña' : null });
      return { data: despues };
    });
  });

  // Instructivos: los lee cualquiera con sesión (salen en cada asistente); los cambia quien maneja el equipo.
  app.get('/instructivos', async (req) => {
    sesion(req);
    const filas = await db('instructivos').select('clave', 'texto');
    return { data: Object.fromEntries(filas.map((f) => [f.clave, f.texto])) };
  });
  app.put('/instructivos', async (req) => {
    const s = await requerir(db, req, 'usuarios', 3);
    const { clave, texto } = instructivoSchema.parse(req.body);
    await db.transaction(async (trx) => {
      const antes = await trx('instructivos').where({ clave }).first('texto');
      if (texto === null) await trx('instructivos').where({ clave }).delete();
      else await trx('instructivos').insert({ clave, texto, usuario_id: s.usuarioId, updated_at: trx.fn.now() }).onConflict('clave').merge();
      await auditar(trx, { usuarioId: s.usuarioId, accion: 'editar', entidad: 'instructivo', antes: antes ?? null, despues: { clave, texto } });
    });
    return { data: { ok: true } };
  });

  app.get('/permisos', async (req) => {
    await requerir(db, req, 'usuarios', 1);
    return { data: await matriz(db) };
  });

  app.put('/permisos', async (req) => {
    const s = await requerir(db, req, 'usuarios', 3);
    const { rol, modulo, nivel } = permisoSchema.parse(req.body);
    const antes = (await matriz(db))[rol][modulo];
    await db.transaction(async (trx) => {
      await trx('rol_permisos').insert({ rol, modulo, nivel }).onConflict(['rol', 'modulo']).merge();
      invalidarPermisos();
      await auditar(trx, { usuarioId: s.usuarioId, accion: 'editar', entidad: 'permiso', antes: { rol, modulo, nivel: antes }, despues: { rol, modulo, nivel } });
    });
    return { data: await matriz(db) };
  });
}

async function asegurarUsuarioLibre(usuario: string): Promise<void> {
  const existe = await db('usuarios').whereRaw('lower(usuario) = ?', [usuario]).whereNull('deleted_at').first('id');
  if (existe) throw new ConflictError('Ese nombre de usuario ya está en uso');
}

async function asegurarMailLibre(email: string | null, salvo?: string): Promise<void> {
  if (!email) return;
  const q = db('usuarios').whereRaw('lower(email) = ?', [email.toLowerCase()]).whereNull('deleted_at');
  if (salvo) q.whereNot({ id: salvo });
  if (await q.first('id')) throw new ConflictError('Ese mail ya lo tiene otra persona del equipo');
}
