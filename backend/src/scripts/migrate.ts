import { db } from '../db.js';

// Uso: tsx src/scripts/migrate.ts [latest|rollback]
const cmd = process.argv[2] ?? 'latest';

async function main(): Promise<void> {
  if (cmd === 'latest') {
    const [batch, log] = await db.migrate.latest();
    console.log(log.length ? `Migradas (batch ${batch}): ${log.join(', ')}` : 'Sin migraciones pendientes.');
  } else if (cmd === 'rollback') {
    const [batch, log] = await db.migrate.rollback();
    console.log(log.length ? `Revertidas (batch ${batch}): ${log.join(', ')}` : 'Nada para revertir.');
  } else {
    throw new Error(`Comando desconocido: ${cmd} (usar latest | rollback)`);
  }
}

main()
  .catch((err) => {
    console.error('Migración falló:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => db.destroy());
