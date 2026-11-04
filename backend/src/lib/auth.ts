import jwt from 'jsonwebtoken';
import type { FastifyRequest } from 'fastify';
import type { Knex } from 'knex';
import { armarMatriz, type MatrizPermisos, type Modulo, type Nivel, type Rol } from '@moldeados/shared';
import { env } from '../config/env.js';
import { ForbiddenError, UnauthorizedError } from './errors.js';

export interface Sesion {
  usuarioId: string;
  rol: Rol;
}

// Sesión de 7 días que se renueva sola: /auth/yo devuelve un token nuevo cada vez que se abre la app (y cada
// 6 h con la app abierta). Quien usa el sistema seguido no vuelve a ver el login; quien no entra en una semana, sí.
export const firmar = (s: Sesion) => jwt.sign(s, env.JWT_SECRET, { expiresIn: '7d' });

/** Usuario y rol salen SIEMPRE del token, nunca del body. */
export function sesion(req: FastifyRequest): Sesion {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) throw new UnauthorizedError();
  try {
    const p = jwt.verify(h.slice(7), env.JWT_SECRET) as Sesion;
    return { usuarioId: p.usuarioId, rol: p.rol };
  } catch {
    throw new UnauthorizedError();
  }
}

// La matriz se lee en cada request y casi nunca cambia: queda en memoria y se recarga al editar permisos.
// ponytail: cache por proceso; con más de una instancia de la API, invalidar por Redis/NOTIFY o bajar el TTL.
let cache: { m: MatrizPermisos; hasta: number } | null = null;
export const invalidarPermisos = () => { cache = null; };
export async function matriz(db: Knex): Promise<MatrizPermisos> {
  if (cache && cache.hasta > Date.now()) return cache.m;
  const m = armarMatriz(await db('rol_permisos').select('rol', 'modulo', 'nivel'));
  cache = { m, hasta: Date.now() + 5 * 60_000 };
  return m;
}

/** Verifica token + usuario activo + nivel mínimo en el módulo. Devuelve la sesión. */
export async function requerir(db: Knex, req: FastifyRequest, modulo: Modulo, nivel: Nivel): Promise<Sesion> {
  const s = sesion(req);
  const u = await db('usuarios').where({ id: s.usuarioId, activo: true }).whereNull('deleted_at').first('rol');
  if (!u) throw new UnauthorizedError();
  // El rol se relee de la base: si el dueño le cambió el rol a alguien, aplica sin esperar a que venza el token.
  const rol = u.rol as Rol;
  if ((await matriz(db))[rol][modulo] < nivel) throw new ForbiddenError();
  return { usuarioId: s.usuarioId, rol };
}

/** Pasa si cumple cualquiera de los requisitos (ej.: ver producción o ver productos). */
export async function requerirAlguno(db: Knex, req: FastifyRequest, opciones: [Modulo, Nivel][]): Promise<Sesion> {
  const s = sesion(req);
  const u = await db('usuarios').where({ id: s.usuarioId, activo: true }).whereNull('deleted_at').first('rol');
  if (!u) throw new UnauthorizedError();
  const m = (await matriz(db))[u.rol as Rol];
  if (!opciones.some(([mod, niv]) => m[mod] >= niv)) throw new ForbiddenError();
  return { usuarioId: s.usuarioId, rol: u.rol as Rol };
}

/** Cualquier persona con usuario activo, sin importar el rol (agenda, avisos, ayuda). */
export async function usuarioActivo(db: Knex, req: FastifyRequest): Promise<Sesion> {
  const s = sesion(req);
  const u = await db('usuarios').where({ id: s.usuarioId, activo: true }).whereNull('deleted_at').first('rol');
  if (!u) throw new UnauthorizedError();
  return { usuarioId: s.usuarioId, rol: u.rol as Rol };
}
