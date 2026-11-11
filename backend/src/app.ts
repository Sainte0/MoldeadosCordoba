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
import { buscarRoutes } from './features/buscar.routes.js';
import { importarRoutes } from './features/importar.js';
import { resumenRoutes } from './features/resumen.js';
import { agendaRoutes } from './features/agenda.js';
import { avisosVivoRoutes } from './features/avisos-vivo.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test', bodyLimit: 1_000_000 });
  // exposedHeaders: sin esto el navegador no deja leer el nombre del archivo exportado (la app y la API son otro origen).
  await app.register(cors, { origin: [env.APP_URL], exposedHeaders: ['Content-Disposition'] });
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, { max: 600, timeWindow: '1 minute' });

  const CAMPOS: Record<string, string> = {
    patente: 'La patente', cuit: 'El CUIT', nroFactura: 'El número de factura', telefono: 'El teléfono', chequeNumero: 'El número de cheque',
    codigo: 'El código', color: 'El color', referencia: 'La referencia', nombre: 'El nombre', email: 'El mail', destino: 'El destino',
    retira: 'Quién retira', beneficiario: 'El beneficiario', titulo: 'El título', direccion: 'La dirección', notas: 'Las notas', detalle: 'El detalle',
  };
  app.setErrorHandler((err: FastifyError | Error, req, reply) => {
    if (err instanceof ZodError) {
      // Solo mensajes propios en castellano; lo que genera Zod solo ("Expected string") nunca llega al usuario.
      const propio = err.issues.find((i) => /^[A-ZÁÉÍÓÚÑ¿¡]/.test(i.message) && !/^(Expected|Invalid|Required|String|Number|Array)\b/.test(i.message));
      // Texto más largo de lo permitido: decir cuál (si no, "Revisá los datos" no dice qué tocar).
      const largo = err.issues.find((i) => i.code === 'too_big' && i.type === 'string');
      const campo = largo && CAMPOS[String(largo.path.at(-1))];
      const porLargo = largo && `${campo ?? 'Un texto'} tiene más de ${String((largo as { maximum: number | bigint }).maximum)} letras: acortalo`;
      return reply.code(400).send({ error: { code: 'VALIDATION', message: propio?.message ?? porLargo ?? 'Revisá los datos ingresados' } });
    }
    if (err instanceof AppError) return reply.code(err.statusCode).send({ error: { code: err.code, message: err.message } });
    if ('statusCode' in err && err.statusCode === 429) return reply.code(429).send({ error: { code: 'RATE_LIMIT', message: 'Demasiados intentos, esperá un minuto' } });
    req.log.error(err);
    return reply.code(500).send({ error: { code: 'INTERNAL', message: 'Algo falló de nuestro lado. Probá de nuevo en un momento.' } });
  });

  // Idempotencia para las cargas que el teléfono guardó sin señal y reenvía: misma clave → misma respuesta, sin
  // volver a ejecutar. Solo POST con la cabecera Idempotency-Key; lo guardado se limpia a los 30 días.
  app.addHook('onRequest', async (req, reply) => {
    const clave = req.headers['idempotency-key'];
    if (req.method !== 'POST' || typeof clave !== 'string') return;
    if (!/^[\w-]{8,100}$/.test(clave)) return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Clave de envío inválida' } });
    const previa = await db('solicitudes_idempotentes').where({ clave }).first('status', 'respuesta', 'ruta');
    if (previa && previa.ruta === req.url) return reply.code(previa.status).header('idempotent-replay', 'true').send(previa.respuesta);
  });
  app.addHook('onSend', async (req, reply, payload) => {
    const clave = req.headers['idempotency-key'];
    if (req.method !== 'POST' || typeof clave !== 'string' || reply.getHeader('idempotent-replay') || reply.statusCode >= 300) return payload;
    let respuesta: unknown = null;
    try { respuesta = typeof payload === 'string' ? JSON.parse(payload) : null; } catch { respuesta = null; }
    await db('solicitudes_idempotentes').insert({ clave, ruta: req.url, status: reply.statusCode, respuesta: JSON.stringify(respuesta) }).onConflict('clave').ignore();
    if (Math.random() < 0.02) await db('solicitudes_idempotentes').where('created_at', '<', db.raw("now() - interval '30 days'")).delete();
    return payload;
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
      await api.register(buscarRoutes);
      await api.register(importarRoutes);
      await api.register(resumenRoutes);
      await api.register(agendaRoutes);
      await api.register(avisosVivoRoutes);
    },
    { prefix: '/api' },
  );
  return app;
}
