import nodemailer from 'nodemailer';
import type { FastifyInstance } from 'fastify';
import type { Knex } from 'knex';
import { formatCantidad, formatPesos, LABEL_TURNO, type Turno, type Unidad } from '@moldeados/shared';
import { env } from '../config/env.js';
import { db } from '../db.js';
import { requerir } from '../lib/auth.js';
import { ValidationError } from '../lib/errors.js';
import { materiasPorAcabarse, recompra } from './avisos.service.js';
import { maquinasConService } from './produccion.service.js';

// Resumen del día para el dueño: lo mismo sirve para compartir por WhatsApp (texto con *negritas*) y para el
// mail automático de cada noche.

const hoyAr = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
const horaAr = () => Number(new Intl.DateTimeFormat('es-AR', { hour: 'numeric', hour12: false, timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date()));
const fechaLarga = (d: string) => new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(d + 'T12:00:00Z'));
const n = (x: unknown) => Number(x ?? 0);

export async function armarResumen(q: Knex, fecha: string): Promise<{ titulo: string; texto: string }> {
  const [ventas, porCliente, cobros, partes, pesajes, compras, gastos, cheques, pedidos] = await Promise.all([
    q('ventas').whereNull('anulado_at').where({ fecha }).first(q.raw('count(*)::int as n'), q.raw('coalesce(sum(total_centavos), 0)::bigint as total'),
      q.raw('coalesce((select sum(i.maples) from venta_items i join ventas v on v.id = i.venta_id where v.anulado_at is null and v.fecha = ?), 0)::bigint as maples', [fecha])),
    q('ventas as v').join('clientes as c', 'c.id', 'v.cliente_id').whereNull('v.anulado_at').where('v.fecha', fecha).groupBy('c.nombre')
      .select('c.nombre', q.raw('sum(v.total_centavos)::bigint as total')).orderBy('total', 'desc').limit(5),
    q('movimientos_dinero').whereNull('anulado_at').where({ fecha, tipo: 'cobro' }).first(q.raw('coalesce(sum(monto_centavos), 0)::bigint as total')),
    q('partes as p').join('maquinas as m', 'm.id', 'p.maquina_id').whereNull('p.anulado_at').where('p.fecha', fecha).groupBy('m.codigo', 'p.turno')
      .select('m.codigo', 'p.turno', q.raw('sum(p.paquetes)::int as paquetes'), q.raw('sum(p.minutos)::int as minutos'),
        q.raw('sum(case when p.maples_por_hora > 0 then floor(p.maples_por_hora * p.minutos / 60.0 / p.maples_por_paquete) end)::int as esperado'))
      .orderBy(['m.codigo', 'p.turno']),
    q('compras as c').join('compra_items as i', 'i.compra_id', 'c.id').whereNull('c.anulada_at').where({ 'c.fecha': fecha, 'c.tipo': 'pesaje' })
      .first(q.raw('count(distinct c.id)::int as n'), q.raw('coalesce(sum(i.cantidad), 0)::bigint as gramos'), q.raw('coalesce(sum(i.subtotal_centavos), 0)::bigint as total')),
    q('compras').whereNull('anulada_at').where({ fecha }).first(q.raw('coalesce(sum(total_centavos), 0)::bigint as total')),
    q('gastos').whereNull('anulado_at').where({ fecha }).first(q.raw('coalesce(sum(monto_centavos), 0)::bigint as total')),
    q('movimientos_dinero as m').leftJoin('clientes as c', 'c.id', 'm.cliente_id').leftJoin('proveedores as p', 'p.id', 'm.proveedor_id')
      .whereNull('m.anulado_at').whereIn('m.medio', ['cheque', 'echeq']).whereBetween('m.cheque_fecha_cobro', [fecha, q.raw("?::date + 2", [fecha])])
      .where((w) => w.where('m.cheque_estado', 'cartera').orWhere('m.tipo', 'pago'))
      .select('m.tipo', 'm.monto_centavos as monto', 'm.cheque_fecha_cobro as dia', q.raw('coalesce(c.nombre, p.nombre) as quien')).orderBy('m.cheque_fecha_cobro'),
    q('pedidos as p').join('clientes as c', 'c.id', 'p.cliente_id').where('p.estado', 'abierto').where('p.fecha_entrega', '<=', q.raw("?::date + 1", [fecha]))
      .select('c.nombre', 'p.fecha_entrega as dia').orderBy('p.fecha_entrega'),
  ]);
  const [porCobrar, materias, maquinas, clientes] = await Promise.all([
    q.raw(`select (coalesce((select sum(total_centavos) from ventas where anulado_at is null), 0) + coalesce((select sum(monto_centavos) from saldos_iniciales where cliente_id is not null and anulado_at is null), 0)
      - coalesce((select sum(monto_centavos) from movimientos_dinero where tipo = 'cobro' and anulado_at is null), 0))::bigint as s`),
    materiasPorAcabarse(q),
    maquinasConService(q),
    recompra(q, fecha),
  ]);

  const titulo = `Resumen del ${fechaLarga(fecha)}`;
  const l: string[] = [`*Moldeados Córdoba · ${titulo}*`, ''];
  l.push(`*Ventas:* ${n(ventas?.n) ? `${n(ventas?.n)} ${n(ventas?.n) === 1 ? 'despacho' : 'despachos'}, ${n(ventas?.maples).toLocaleString('es-AR')} maples, ${formatPesos(n(ventas?.total))}` : 'sin despachos'}`);
  for (const c of porCliente) l.push(`  · ${c.nombre}: ${formatPesos(n(c.total))}`);
  l.push(`*Cobrado:* ${formatPesos(n(cobros?.total))}`);
  const totalPaq = partes.reduce((a: number, p: { paquetes: number }) => a + p.paquetes, 0);
  l.push(`*Producción:* ${partes.length ? `${totalPaq.toLocaleString('es-AR')} paquetes` : 'sin partes cargados'}`);
  for (const p of partes as { codigo: string; turno: Turno; paquetes: number; esperado: number | null }[]) {
    l.push(`  · ${p.codigo} ${LABEL_TURNO[p.turno].toLowerCase()}: ${p.paquetes} paq.${p.esperado ? ` (rinde ${Math.round((p.paquetes / p.esperado) * 100)} %)` : ''}`);
  }
  if (n(pesajes?.n)) l.push(`*Cartón recibido:* ${formatCantidad(n(pesajes?.gramos), 'kg')} en ${n(pesajes?.n)} pesajes`);
  l.push(`*Compras:* ${formatPesos(n(compras?.total))} · *Gastos:* ${formatPesos(n(gastos?.total))}`);
  l.push(`*Nos deben en total:* ${formatPesos(n(porCobrar.rows[0]?.s))}`);
  const avisos: string[] = [];
  for (const c of cheques as { tipo: string; monto: number; dia: string; quien: string }[]) avisos.push(`Cheque ${c.tipo === 'pago' ? 'nuestro a cubrir' : 'para depositar'} ${c.dia === fecha ? 'hoy' : `el ${c.dia.slice(8, 10)}/${c.dia.slice(5, 7)}`}: ${formatPesos(n(c.monto))} (${c.quien})`);
  for (const p of pedidos as { nombre: string; dia: string }[]) avisos.push(`Pedido de ${p.nombre} ${p.dia < fecha ? 'atrasado' : p.dia === fecha ? 'para hoy' : 'para mañana'}`);
  for (const m of materias as { nombre: string; estado: { titulo: string; detalle: string } }[]) avisos.push(`${m.nombre}: ${m.estado.titulo.toLowerCase()}. ${m.estado.detalle}`);
  for (const m of maquinas.filter((x) => x.activo && x.leTocaService)) avisos.push(`${m.codigo}: le toca service (${m.horasDesdeService} h)`);
  const leToca = clientes.filter((c) => c.estado === 'le_toca').length;
  if (leToca) avisos.push(`${leToca} ${leToca === 1 ? 'cliente al que le toca' : 'clientes a los que les toca'} comprar`);
  if (avisos.length) l.push('', '*Atención:*', ...avisos.map((a) => `  · ${a}`));
  return { titulo, texto: l.join('\n') };
}

/** ¿Hay que mandar el resumen ahora? Una vez por día, a partir de la hora configurada. */
export const toca = (hora: number, ahora: number, enviado: string | null, hoy: string) => ahora >= hora && enviado !== hoy;

async function enviarMail(para: string[], asunto: string, texto: string): Promise<void> {
  if (env.EMAIL_PROVIDER === 'log' || !env.SMTP_USER) {
    console.log(`[resumen] (mail no configurado) para ${para.join(', ')}:\n${texto}`);
    return;
  }
  const t = nodemailer.createTransport({ host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_PORT === 465, auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } });
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;white-space:pre-wrap">${texto
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\*([^*]+)\*/g, '<b>$1</b>')}</div>`;
  await t.sendMail({ from: env.EMAIL_FROM, to: para, subject: asunto, text: texto.replace(/\*/g, ''), html });
}

/** Lo llama un timer del servidor cada minuto. "Reclama" el envío del día en la base antes de mandar: aunque haya dos procesos, sale uno solo. */
export async function revisarResumenDiario(log: (msg: string, err?: unknown) => void): Promise<void> {
  const e = await db('empresa').first('resumen_emails', 'resumen_hora', 'resumen_enviado');
  const para = (e?.resumen_emails ?? '').split(/[,;\s]+/).filter((x: string) => x.includes('@'));
  const hoy = hoyAr();
  if (!e || !para.length || !toca(e.resumen_hora, horaAr(), e.resumen_enviado, hoy)) return;
  const reclamado = await db('empresa').where({ id: 1 }).where((w) => w.whereNull('resumen_enviado').orWhereNot('resumen_enviado', hoy)).update({ resumen_enviado: hoy });
  if (!reclamado) return;
  try {
    const r = await armarResumen(db, hoy);
    await enviarMail(para, `Moldeados Córdoba · ${r.titulo}`, r.texto);
    log(`resumen diario enviado a ${para.join(', ')}`);
  } catch (err) {
    await db('empresa').where({ id: 1 }).update({ resumen_enviado: null }); // que lo reintente en el próximo minuto
    log('no se pudo mandar el resumen diario', err);
  }
}

export async function resumenRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { fecha?: string } }>('/resumen', async (req) => {
    await requerir(db, req, 'tablero', 1);
    const fecha = req.query.fecha ?? hoyAr();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new ValidationError('La fecha no es válida');
    return { data: await armarResumen(db, fecha) };
  });
}
