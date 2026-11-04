import bcrypt from 'bcryptjs';
import { ROLES, type Rol } from '@moldeados/shared';
import { db } from '../db.js';

// Primer usuario (o recuperar acceso). Uso: pnpm crear-usuario <usuario> <contraseña> "<Nombre>" [rol=dueno]
const [usuario, password, nombre, rol = 'dueno'] = process.argv.slice(2);

async function main(): Promise<void> {
  if (!usuario || !password || !nombre) throw new Error('Uso: pnpm crear-usuario <usuario> <contraseña> "<Nombre>" [rol]');
  if (!(ROLES as readonly string[]).includes(rol)) throw new Error(`Rol inválido. Opciones: ${ROLES.join(', ')}`);
  const hash = await bcrypt.hash(password, 10);
  const existe = await db('usuarios').whereRaw('lower(usuario) = ?', [usuario.toLowerCase()]).whereNull('deleted_at').first('id');
  if (existe) await db('usuarios').where({ id: existe.id }).update({ password_hash: hash, nombre, rol: rol as Rol, activo: true, updated_at: db.fn.now() });
  else await db('usuarios').insert({ usuario: usuario.toLowerCase(), password_hash: hash, nombre, rol });
  console.log(`${existe ? 'Actualizado' : 'Creado'}: ${usuario} (${rol})`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.destroy());
