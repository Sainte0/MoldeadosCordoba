import { buildApp } from './app.js';
import { env } from './config/env.js';
import { db } from './db.js';

const app = await buildApp();
await app.listen({ port: env.PORT, host: '0.0.0.0' });

async function shutdown(): Promise<void> {
  await app.close();
  await db.destroy();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
