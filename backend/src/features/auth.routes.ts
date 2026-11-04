import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { instructivoSchema, loginSchema, usuarioSchema, permisoSchema, type Rol } from '@moldeados/shared';
import { db } from '../db.js';
import { firmar, matriz, requerir, sesion } from '../lib/auth.js';
import { auditar } from '../lib/auditoria.js';
import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from '../lib/errors.js';

// Login, sesión actual, equipo (usuarios) y matriz de permisos por rol.
// ponytail: CRUD chico sin capa repository aparte; partir si crece lógica de negocio acá.

const COLS = ['id', 'nombre', 'usuario', 'rol', 'activo'] as const;

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

  app.get('/auth/yo', async (req) => {
    const s = sesion(req);
    const u = await db('usuarios').where({ id: s.usuarioId, activo: true }).whereNull('deleted_at').first(COLS);
    if (!u) throw new UnauthorizedError();
    return { data: { usuario: u, permisos: (await matriz(db))[u.rol as Rol] } };
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
    const [u] = await db.transaction(async (trx) => {
      const filas = await trx('usuarios')
        .insert({ nombre: input.nombre, usuario: input.usuario, rol: input.rol, activo: input.activo, password_hash: await bcrypt.hash(input.password!, 10) })
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
    const cambios: Record<string, unknown> = { nombre: input.nombre, usuario: input.usuario, rol: input.rol, activo: input.activo, updated_at: db.fn.now() };
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
      await auditar(trx, { usuarioId: s.usuarioId, accion: 'editar', entidad: 'permiso', antes: { rol, modulo, nivel: antes }, despues: { rol, modulo, nivel } });
    });
    return { data: await matriz(db) };
  });
}

async function asegurarUsuarioLibre(usuario: string): Promise<void> {
  const existe = await db('usuarios').whereRaw('lower(usuario) = ?', [usuario]).whereNull('deleted_at').first('id');
  if (existe) throw new ConflictError('Ese nombre de usuario ya está en uso');
}
