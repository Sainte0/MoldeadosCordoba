import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { ZodError } from 'zod';
import { env } from './config/env.js';
import { db } from './db.js';
import { AppError } from './lib/errors.js';
import { authRoutes } from './features/auth.routes.js';
import { proveedoresRoutes } from './features/proveedores.routes.js';
import { materiasRoutes } from './features/materias.routes.js';
import { comprasRoutes } from './features/compras.routes.js';
import { auditoriaRoutes } from './features/auditoria.routes.js';
import { produccionRoutes } from './features/produccion.routes.js';
import { ventasRoutes } from './features/ventas.routes.js';
import { gastosRoutes } from './features/gastos.routes.js';
import { exportarRoutes } from './features/exportar.js';
import { ayudaRoutes } from './features/ayuda.routes.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test', bodyLimit: 1_000_000 });
  // exposedHeaders: sin esto el navegador no deja leer el nombre del archivo exportado (la app y la API son otro origen).
  await app.register(cors, { origin: [env.APP_URL], exposedHeaders: ['Content-Disposition'] });
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, { max: 600, timeWindow: '1 minute' });

  app.setErrorHandler((err: FastifyError | Error, req, reply) => {
    if (err instanceof ZodError) {
      // Solo mensajes propios en castellano; lo que genera Zod solo ("Expected string") nunca llega al usuario.
      const propio = err.issues.find((i) => /^[A-ZÁÉÍÓÚÑ¿¡]/.test(i.message) && !/^(Expected|Invalid|Required|String|Number|Array)\b/.test(i.message));
      return reply.code(400).send({ error: { code: 'VALIDATION', message: propio?.message ?? 'Revisá los datos ingresados' } });
    }
    if (err instanceof AppError) return reply.code(err.statusCode).send({ error: { code: err.code, message: err.message } });
    if ('statusCode' in err && err.statusCode === 429) return reply.code(429).send({ error: { code: 'RATE_LIMIT', message: 'Demasiados intentos, esperá un minuto' } });
    req.log.error(err);
    return reply.code(500).send({ error: { code: 'INTERNAL', message: 'Algo falló de nuestro lado. Probá de nuevo en un momento.' } });
  });

  app.get('/health', async () => {
    await db.raw('select 1');
    return { ok: true };
  });

  await app.register(
    async (api) => {
      await api.register(authRoutes);
      await api.register(proveedoresRoutes);
      await api.register(materiasRoutes);
      await api.register(comprasRoutes);
      await api.register(auditoriaRoutes);
      await api.register(produccionRoutes);
      await api.register(ventasRoutes);
      await api.register(gastosRoutes);
      await api.register(exportarRoutes);
      await api.register(ayudaRoutes);
    },
    { prefix: '/api' },
  );
  return app;
}
