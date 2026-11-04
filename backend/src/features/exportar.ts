import type { FastifyInstance } from 'fastify';
import type { Knex } from 'knex';
import { LABEL_MEDIO_GASTO, LABEL_TURNO, LABEL_VEHICULO, MEDIOS_GASTO, type MatrizPermisos, type Modulo, type Rol } from '@moldeados/shared';
import { db } from '../db.js';
import { matriz, requerirAlguno } from '../lib/auth.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { zip } from '../lib/zip.js';
import { horasPorPersona } from './produccion.service.js';

// Exportar: cada listado como CSV que abre bien en Excel en castellano (separador ";", coma decimal, BOM UTF-8,
// fechas dd/mm/aaaa). Plata en pesos con centavos y cantidades en kg/L: nunca los enteros internos.

type Fmt = (v: unknown) => string;
const pesos: Fmt = (v) => (v === null || v === undefined ? '' : (Number(v) / 100).toFixed(2).replace('.', ','));
const mili: Fmt = (v) => (v === null || v === undefined ? '' : String(Number(v) / 1000).replace('.', ','));
const fecha: Fmt = (v) => { if (!v) return ''; const s = v instanceof Date ? v.toISOString() : String(v); const [y, m, d] = s.slice(0, 10).split('-'); return `${d}/${m}/${y}`; };
const momento: Fmt = (v) => (v ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(v as string)) : '');
const sino: Fmt = (v) => (v ? 'Sí' : 'No');
const horas: Fmt = (v) => String(Number(v) / 60).replace('.', ',');
const nro: Fmt = (v) => (v === null || v === undefined ? '' : String(v).padStart(6, '0'));
const medio: Fmt = (v) => (MEDIOS_GASTO as readonly string[]).includes(String(v)) ? LABEL_MEDIO_GASTO[v as (typeof MEDIOS_GASTO)[number]] : String(v ?? '');
const vehiculo: Fmt = (v) => (v ? LABEL_VEHICULO[v as keyof typeof LABEL_VEHICULO] ?? String(v) : '');
const turno: Fmt = (v) => (v ? LABEL_TURNO[v as keyof typeof LABEL_TURNO] ?? String(v) : '');

type Columna = [titulo: string, campo: string, fmt?: Fmt];
function csv(filas: Record<string, unknown>[], cols: Columna[]): Buffer {
  const celda = (s: string) => (/[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lineas = [cols.map((c) => celda(c[0])).join(';'), ...filas.map((f) => cols.map(([, k, fmt]) => celda(fmt ? fmt(f[k]) : f[k] === null || f[k] === undefined ? '' : String(f[k]))).join(';'))];
  return Buffer.from('﻿' + lineas.join('\r\n'), 'utf8');
}

interface Periodo { desde?: string; hasta?: string }
const entre = (col: string, p: Periodo) => (q: Knex.QueryBuilder) => { if (p.desde) q.where(col, '>=', p.desde); if (p.hasta) q.where(col, '<=', p.hasta); };

/** Cada conjunto exportable: quién lo puede bajar, si usa período, y cómo se arma. */
const CONJUNTOS: Record<string, { titulo: string; modulo: Modulo; periodo: boolean; armar: (p: Periodo) => Promise<Buffer> }> = {
  ventas: { titulo: 'Ventas (un renglón por palet)', modulo: 'ventas', periodo: true, armar: async (p) => csv(
    await db('venta_items as i').join('ventas as v', 'v.id', 'i.venta_id').join('clientes as c', 'c.id', 'v.cliente_id').join('palets as pa', 'pa.id', 'i.palet_id').join('variantes as va', 'va.id', 'i.variante_id')
      .modify(entre('v.fecha', p)).orderBy(['v.fecha', 'v.numero', 'pa.numero'])
      .select('v.fecha', 'v.numero', 'c.nombre as cliente', 'c.cuit', 'v.retira', 'v.vehiculo', 'v.patente', 'pa.numero as palet', 'va.codigo', 'i.maples', 'i.precio_maple_centavos as precio', 'i.subtotal_centavos as subtotal',
        'v.con_factura', 'v.nro_factura', 'v.iva_bp', 'v.total_centavos as total', db.raw('v.anulado_at is not null as anulada')),
    [['Fecha', 'fecha', fecha], ['Remito', 'numero', nro], ['Cliente', 'cliente'], ['CUIT', 'cuit'], ['Retiró', 'retira'], ['Vehículo', 'vehiculo', vehiculo], ['Patente', 'patente'], ['Palet', 'palet', nro],
      ['Código', 'codigo'], ['Maples', 'maples'], ['Precio por maple', 'precio', pesos], ['Subtotal sin IVA', 'subtotal', pesos], ['Con factura', 'con_factura', sino], ['N.º factura', 'nro_factura'],
      ['IVA %', 'iva_bp', (v) => String(Number(v) / 100).replace('.', ',')], ['Total del remito', 'total', pesos], ['Anulada', 'anulada', sino]]) },
  compras: { titulo: 'Compras y pesajes (un renglón por producto)', modulo: 'compras', periodo: true, armar: async (p) => csv(
    await db('compra_items as i').join('compras as c', 'c.id', 'i.compra_id').join('proveedores as pr', 'pr.id', 'c.proveedor_id').join('materias_primas as m', 'm.id', 'i.materia_prima_id')
      .modify(entre('c.fecha', p)).orderBy(['c.fecha', 'c.numero'])
      .select('c.fecha', 'c.numero', 'c.tipo', 'pr.nombre as proveedor', 'pr.cuit', 'm.nombre as materia', 'm.unidad', 'i.cantidad', 'i.precio_unitario_centavos as precio', 'i.subtotal_centavos as subtotal',
        'c.con_factura', 'c.nro_factura', 'c.iva_centavos as iva', 'c.total_centavos as total', 'c.bruto_g', 'c.tara_g', 'c.patente', db.raw('c.anulada_at is not null as anulada')),
    [['Fecha', 'fecha', fecha], ['N.º', 'numero', nro], ['Tipo', 'tipo', (v) => (v === 'pesaje' ? 'Pesaje' : 'Compra')], ['Proveedor', 'proveedor'], ['CUIT', 'cuit'], ['Producto', 'materia'], ['Unidad', 'unidad', (v) => (v === 'kg' ? 'kg' : 'L')],
      ['Cantidad', 'cantidad', mili], ['Precio unitario', 'precio', pesos], ['Subtotal sin IVA', 'subtotal', pesos], ['Con factura', 'con_factura', sino], ['N.º factura', 'nro_factura'], ['IVA de la compra', 'iva', pesos],
      ['Total de la compra', 'total', pesos], ['Bruto kg', 'bruto_g', mili], ['Tara kg', 'tara_g', mili], ['Patente', 'patente'], ['Anulada', 'anulada', sino]]) },
  produccion: { titulo: 'Partes de producción', modulo: 'produccion', periodo: true, armar: async (p) => csv(
    await db('partes as p').join('variantes as v', 'v.id', 'p.variante_id').join('maquinas as m', 'm.id', 'p.maquina_id').join('usuarios as u', 'u.id', 'p.usuario_id')
      .modify(entre('p.fecha', p)).orderBy(['p.fecha', 'p.numero'])
      .select('p.fecha', 'p.numero', 'p.turno', 'm.codigo as maquina', 'v.codigo', 'p.minutos', 'p.pulpeadas', 'p.paquetes', db.raw('p.paquetes * p.maples_por_paquete as maples'),
        db.raw('case when p.maples_por_hora > 0 then floor(p.maples_por_hora * p.minutos / 60.0 / p.maples_por_paquete) end as esperado'),
        db.raw(`(select string_agg(e.nombre, ', ' order by e.nombre) from parte_empleados pe join empleados e on e.id = pe.empleado_id where pe.parte_id = p.id) as personal`),
        'u.nombre as cargo', db.raw('p.anulado_at is not null as anulado')),
    [['Fecha', 'fecha', fecha], ['Parte', 'numero', nro], ['Turno', 'turno', turno], ['Máquina', 'maquina'], ['Código', 'codigo'], ['Horas', 'minutos', horas], ['Pulpeadas', 'pulpeadas'], ['Paquetes', 'paquetes'],
      ['Maples', 'maples'], ['Paquetes esperados', 'esperado'], ['Personal', 'personal'], ['Cargado por', 'cargo'], ['Anulado', 'anulado', sino]]) },
  consumos: { titulo: 'Materia prima usada en producción', modulo: 'produccion', periodo: true, armar: async (p) => csv(
    await db('parte_consumos as c').join('partes as p', 'p.id', 'c.parte_id').join('materias_primas as m', 'm.id', 'c.materia_prima_id').join('variantes as v', 'v.id', 'p.variante_id')
      .whereNull('p.anulado_at').modify(entre('p.fecha', p)).orderBy(['p.fecha', 'p.numero', 'm.nombre'])
      .select('p.fecha', 'p.numero', 'v.codigo', 'm.nombre as materia', 'm.unidad', 'c.teorico', 'c.real'),
    [['Fecha', 'fecha', fecha], ['Parte', 'numero', nro], ['Código', 'codigo'], ['Materia prima', 'materia'], ['Unidad', 'unidad', (v) => (v === 'kg' ? 'kg' : 'L')], ['Según receta', 'teorico', mili], ['Usado', 'real', mili]]) },
  palets: { titulo: 'Palets', modulo: 'produccion', periodo: false, armar: async () => csv(
    await db('palets as pa').join('variantes as v', 'v.id', 'pa.variante_id').leftJoin('ventas as ve', 've.id', 'pa.venta_id').leftJoin('clientes as c', 'c.id', 've.cliente_id')
      .orderBy('pa.numero').select('pa.numero', 'pa.created_at', 'v.codigo', 'pa.paquetes', db.raw('pa.paquetes * v.maples_por_paquete as maples'), db.raw("pa.ancho || 'x' || pa.largo || 'x' || pa.alto as armado"),
        'pa.vehiculo', 'pa.destino', db.raw("case when pa.anulado_at is not null then 'Desarmado' when pa.venta_id is not null then 'Vendido' else 'Listo para salir' end as estado"), 've.numero as remito', 'c.nombre as cliente'),
    [['Palet', 'numero', nro], ['Armado', 'created_at', momento], ['Código', 'codigo'], ['Paquetes', 'paquetes'], ['Maples', 'maples'], ['Armado (an×la×al)', 'armado'], ['Vehículo', 'vehiculo', vehiculo], ['Destino', 'destino'],
      ['Estado', 'estado'], ['Remito', 'remito', nro], ['Cliente', 'cliente']]) },
  horas: { titulo: 'Horas por persona (según los partes)', modulo: 'produccion', periodo: true, armar: async (p) => csv(await horasPorPersona(db, p.desde, p.hasta),
    [['Persona', 'nombre'], ['Horas', 'minutos', horas], ['Mañana (h)', 'manana', horas], ['Tarde (h)', 'tarde', horas], ['Días', 'dias'], ['Partes', 'partes'],
      ['Valor hora', 'valorHora', pesos], ['Estimado a pagar', 'estimado', pesos]]) },
  stock: { titulo: 'Stock de materia prima', modulo: 'materias', periodo: false, armar: async () => csv(
    await db('materias_primas as m').whereNull('m.deleted_at').orderBy('m.nombre')
      .select('m.nombre', 'm.tipo', 'm.unidad', 'm.stock_minimo', db.raw('(select coalesce(sum(cantidad), 0) from movimientos_stock s where s.materia_prima_id = m.id) as stock'), 'm.activo'),
    [['Materia prima', 'nombre'], ['Tipo', 'tipo'], ['Unidad', 'unidad', (v) => (v === 'kg' ? 'kg' : 'L')], ['Stock', 'stock', mili], ['Mínimo', 'stock_minimo', mili], ['Activa', 'activo', sino]]) },
  gastos: { titulo: 'Gastos', modulo: 'gastos', periodo: true, armar: async (p) => csv(
    await db('gastos as g').join('categorias_gasto as k', 'k.id', 'g.categoria_id').leftJoin('bancos as b', 'b.id', 'g.banco_id').leftJoin('empleados as e', 'e.id', 'g.empleado_id')
      .modify(entre('g.fecha', p)).orderBy(['g.fecha', 'g.numero'])
      .select('g.fecha', 'g.numero', 'k.nombre as categoria', 'g.descripcion', 'e.nombre as empleado', 'g.monto_centavos as monto', 'g.medio', 'b.nombre as banco', 'g.con_factura', 'g.nro_factura',
        db.raw('g.comprobante_id is not null as foto'), db.raw('g.anulado_at is not null as anulado')),
    [['Fecha', 'fecha', fecha], ['N.º', 'numero', nro], ['Categoría', 'categoria'], ['Qué', 'descripcion'], ['Persona', 'empleado'], ['Monto', 'monto', pesos], ['Medio', 'medio', medio], ['Banco', 'banco'],
      ['Con factura', 'con_factura', sino], ['N.º factura', 'nro_factura'], ['Con foto', 'foto', sino], ['Anulado', 'anulado', sino]]) },
  dinero: { titulo: 'Cobros y pagos', modulo: 'cuentas', periodo: true, armar: async (p) => csv(
    await db('movimientos_dinero as m').leftJoin('clientes as c', 'c.id', 'm.cliente_id').leftJoin('proveedores as pr', 'pr.id', 'm.proveedor_id').leftJoin('bancos as b', 'b.id', 'm.banco_id')
      .modify(entre('m.fecha', p)).orderBy(['m.fecha', 'm.numero'])
      .select('m.fecha', 'm.numero', 'm.tipo', db.raw('coalesce(c.nombre, pr.nombre) as quien'), 'm.monto_centavos as monto', 'm.medio', 'b.nombre as banco', 'm.cheque_numero', 'm.cheque_fecha_cobro',
        'm.referencia', db.raw('m.anulado_at is not null as anulado')),
    [['Fecha', 'fecha', fecha], ['N.º', 'numero', nro], ['Tipo', 'tipo', (v) => (v === 'cobro' ? 'Cobro' : 'Pago')], ['Cliente / proveedor', 'quien'], ['Monto', 'monto', pesos], ['Medio', 'medio', medio], ['Banco', 'banco'],
      ['N.º cheque', 'cheque_numero'], ['Fecha de cobro', 'cheque_fecha_cobro', fecha], ['Referencia', 'referencia'], ['Anulado', 'anulado', sino]]) },
  cuentas: { titulo: 'Saldos de cuentas corrientes (hoy)', modulo: 'cuentas', periodo: false, armar: async () => {
    const r = await db.raw(`
      select 'Cliente' as tipo, c.nombre, c.cuit,
        coalesce((select sum(total_centavos) from ventas where cliente_id = c.id and anulado_at is null), 0)
          + coalesce((select sum(monto_centavos) from saldos_iniciales where cliente_id = c.id and anulado_at is null), 0) as debe,
        coalesce((select sum(monto_centavos) from movimientos_dinero where cliente_id = c.id and anulado_at is null), 0) as haber
      from clientes c where c.deleted_at is null
      union all
      select 'Proveedor', p.nombre, p.cuit,
        coalesce((select sum(total_centavos) from compras where proveedor_id = p.id and anulada_at is null), 0)
          + coalesce((select sum(monto_centavos) from saldos_iniciales where proveedor_id = p.id and anulado_at is null), 0),
        coalesce((select sum(monto_centavos) from movimientos_dinero where proveedor_id = p.id and anulado_at is null), 0)
      from proveedores p where p.deleted_at is null order by 1, 2`);
    return csv(r.rows.map((x: { debe: string; haber: string }) => ({ ...x, saldo: Number(x.debe) - Number(x.haber) })),
      [['Tipo', 'tipo'], ['Nombre', 'nombre'], ['CUIT', 'cuit'], ['Ventas / compras', 'debe', pesos], ['Cobrado / pagado', 'haber', pesos], ['Saldo', 'saldo', pesos]]);
  } },
  clientes: { titulo: 'Clientes', modulo: 'ventas', periodo: false, armar: async () => csv(
    await db('clientes').whereNull('deleted_at').orderBy('nombre').select('nombre', 'cuit', 'telefono', 'email', 'direccion', 'vehiculo_habitual', 'notas'),
    [['Nombre', 'nombre'], ['CUIT', 'cuit'], ['Teléfono', 'telefono'], ['Email', 'email'], ['Dirección', 'direccion'], ['Suele retirar en', 'vehiculo_habitual', vehiculo], ['Notas', 'notas']]) },
  proveedores: { titulo: 'Proveedores', modulo: 'proveedores', periodo: false, armar: async () => csv(
    await db('proveedores').whereNull('deleted_at').orderBy('nombre').select('nombre', 'cuit', 'telefono', 'email', 'direccion', db.raw("array_to_string(tipos, ', ') as tipos"), 'notas'),
    [['Nombre', 'nombre'], ['CUIT', 'cuit'], ['Teléfono', 'telefono'], ['Email', 'email'], ['Dirección', 'direccion'], ['Vende', 'tipos'], ['Notas', 'notas']]) },
  caja: { titulo: 'Caja chica', modulo: 'gastos', periodo: true, armar: async (p) => csv(
    await db('caja_movimientos as m').join('usuarios as u', 'u.id', 'm.usuario_id').modify(entre('m.fecha', p)).orderBy(['m.fecha', 'm.created_at'])
      .select('m.fecha', 'm.motivo', 'm.concepto', 'm.monto_centavos as monto', 'u.nombre as usuario'),
    [['Fecha', 'fecha', fecha], ['Movimiento', 'motivo'], ['Concepto', 'concepto'], ['Monto', 'monto', pesos], ['Cargó', 'usuario']]) },
  registro: { titulo: 'Registro de cambios', modulo: 'auditoria', periodo: true, armar: async (p) => csv(
    await db('auditoria as a').leftJoin('usuarios as u', 'u.id', 'a.usuario_id')
      .modify((q) => { if (p.desde) q.where('a.created_at', '>=', p.desde); if (p.hasta) q.whereRaw('a.created_at < ?::date + 1', [p.hasta]); })
      .orderBy('a.created_at').select('a.created_at', 'u.nombre as usuario', 'a.accion', 'a.entidad', 'a.motivo'),
    [['Fecha y hora', 'created_at', momento], ['Usuario', 'usuario'], ['Acción', 'accion'], ['Sobre', 'entidad'], ['Motivo', 'motivo']]) },
};

const fechaOk = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
const disponibles = (m: MatrizPermisos, rol: Rol) => Object.entries(CONJUNTOS).filter(([, c]) => m[rol][c.modulo] >= 1);
const sufijo = (p: Periodo) => (p.desde || p.hasta ? `_${p.desde ?? 'inicio'}_a_${p.hasta ?? 'hoy'}` : '');

export async function exportarRoutes(app: FastifyInstance): Promise<void> {
  const quien = (req: Parameters<typeof requerirAlguno>[1]) =>
    requerirAlguno(db, req, (['ventas', 'compras', 'produccion', 'materias', 'gastos', 'cuentas', 'proveedores', 'auditoria'] as Modulo[]).map((m) => [m, 1]));

  app.get('/exportar', async (req) => {
    const s = await quien(req);
    return { data: disponibles(await matriz(db), s.rol).map(([id, c]) => ({ id, titulo: c.titulo, periodo: c.periodo })) };
  });

  app.get<{ Params: { que: string }; Querystring: Periodo }>('/exportar/:que', async (req, reply) => {
    const s = await quien(req);
    const p = { desde: fechaOk(req.query.desde), hasta: fechaOk(req.query.hasta) };
    if (p.desde && p.hasta && p.desde > p.hasta) throw new ValidationError('El período no es válido');
    const lista = disponibles(await matriz(db), s.rol);
    if (req.params.que === 'todo') {
      const archivos = await Promise.all(lista.map(async ([id, c]) => ({ nombre: `${id}${c.periodo ? sufijo(p) : ''}.csv`, datos: await c.armar(c.periodo ? p : {}) })));
      return reply.header('Content-Type', 'application/zip').header('Content-Disposition', `attachment; filename="moldeados${sufijo(p)}.zip"`).send(zip(archivos));
    }
    const c = lista.find(([id]) => id === req.params.que)?.[1];
    if (!c) throw new NotFoundError('No hay nada para exportar con ese nombre, o tu usuario no lo puede ver');
    return reply.header('Content-Type', 'text/csv; charset=utf-8').header('Content-Disposition', `attachment; filename="${req.params.que}${c.periodo ? sufijo(p) : ''}.csv"`).send(await c.armar(c.periodo ? p : {}));
  });
}
