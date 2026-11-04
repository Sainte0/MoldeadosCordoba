import { existsSync } from 'node:fs';
import dotenv from 'dotenv';
import { z } from 'zod';

// Hora Argentina para todo el proceso (logs, fechas por defecto). Ver regla de oro en ~/CLAUDE.md.
process.env.TZ = 'America/Argentina/Buenos_Aires';
dotenv.config({ path: existsSync('.env.local') ? '.env.local' : '.env' });

const schema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),
  PORT: z.coerce.number().int().positive().default(4800),
  APP_URL: z.string().url().default('http://localhost:4801'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET debe tener al menos 16 caracteres'),
  // Mails (resumen diario, código para recuperar la contraseña): 'resend', 'smtp' (Hostinger u otra casilla) o 'log' (no manda, imprime).
  EMAIL_PROVIDER: z.enum(['log', 'smtp', 'resend']).default('log'),
  RESEND_API_KEY: z.string().optional(),
  SMTP_HOST: z.string().default('smtp.hostinger.com'),
  SMTP_PORT: z.coerce.number().int().positive().default(465),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default('Moldeados Córdoba <sistema@moldeadoscordoba.com.ar>'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Config inválida (.env):', parsed.error.flatten().fieldErrors);
  process.exit(1);
}
export const env = parsed.data;
