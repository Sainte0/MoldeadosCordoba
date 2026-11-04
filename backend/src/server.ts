import { buildApp } from './app.js';
import { env } from './config/env.js';
import { db } from './db.js';
import { revisarResumenDiario } from './features/resumen.js';
import { revisarRecordatorios } from './features/agenda.js';

const app = await buildApp();
await app.listen({ port: env.PORT, host: '0.0.0.0' });

// Cada minuto: el resumen diario por mail (si ya es la hora y no salió hoy) y los recordatorios de la agenda que tocan.
// ponytail: timer en el proceso (como el sync de Centrolab); pasar a una cola si hay más trabajos programados.
setInterval(() => {
  void revisarResumenDiario((msg, err) => (err ? app.log.error({ err }, msg) : app.log.info(msg)));
  void revisarRecordatorios().catch((err) => app.log.error({ err }, 'No se pudieron revisar los recordatorios'));
}, 60_000).unref();

async function shutdown(): Promise<void> {
  await app.close();
  await db.destroy();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
