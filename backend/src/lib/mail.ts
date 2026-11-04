import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

// Un solo lugar para mandar mails. EMAIL_PROVIDER: 'resend' (API de Resend, con RESEND_API_KEY), 'smtp' (una casilla,
// ej. Hostinger) o 'log' (no manda: lo imprime en el log; para desarrollo).

export interface Mail { para: string[]; asunto: string; texto: string; html?: string }

const html = (texto: string) => `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;white-space:pre-wrap">${texto
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\*([^*]+)\*/g, '<b>$1</b>')}</div>`;

export async function enviarMail(m: Mail): Promise<void> {
  const texto = m.texto.replace(/\*/g, '');
  if (env.EMAIL_PROVIDER === 'resend' && env.RESEND_API_KEY) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: m.para, subject: m.asunto, text: texto, html: m.html ?? html(m.texto) }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) throw new Error(`Resend respondió ${r.status}: ${(await r.text()).slice(0, 300)}`);
    return;
  }
  if (env.EMAIL_PROVIDER === 'smtp' && env.SMTP_USER) {
    const t = nodemailer.createTransport({ host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_PORT === 465, auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } });
    await t.sendMail({ from: env.EMAIL_FROM, to: m.para, subject: m.asunto, text: texto, html: m.html ?? html(m.texto) });
    return;
  }
  console.log(`[mail] (sin enviar: EMAIL_PROVIDER=${env.EMAIL_PROVIDER}) para ${m.para.join(', ')} · ${m.asunto}\n${texto}`);
}
