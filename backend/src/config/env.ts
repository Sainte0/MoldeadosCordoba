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
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Config inválida (.env):', parsed.error.flatten().fieldErrors);
  process.exit(1);
}
export const env = parsed.data;
