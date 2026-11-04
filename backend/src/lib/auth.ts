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

// ponytail: sesión de 12 h (un turno largo) sin refresh token; agregar refresh si piden sesiones de días.
export const firmar = (s: Sesion) => jwt.sign(s, env.JWT_SECRET, { expiresIn: '12h' });

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

export async function matriz(db: Knex): Promise<MatrizPermisos> {
  return armarMatriz(await db('rol_permisos').select('rol', 'modulo', 'nivel'));
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
