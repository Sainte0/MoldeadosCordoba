import { buildApp } from './app.js';
import { env } from './config/env.js';
import { db } from './db.js';
import { revisarResumenDiario } from './features/resumen.js';

const app = await buildApp();
await app.listen({ port: env.PORT, host: '0.0.0.0' });

// Resumen diario por mail: se revisa cada minuto si ya es la hora configurada y no se mandó hoy.
// ponytail: timer en el proceso (como el sync de Centrolab); pasar a una cola si hay más trabajos programados.
setInterval(() => {
  void revisarResumenDiario((msg, err) => (err ? app.log.error({ err }, msg) : app.log.info(msg)));
}, 60_000).unref();

async function shutdown(): Promise<void> {
  await app.close();
  await db.destroy();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
