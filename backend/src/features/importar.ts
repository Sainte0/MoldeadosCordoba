import type { FastifyInstance } from 'fastify';
import type { Knex } from 'knex';
import { z } from 'zod';
import { aCentavos, aMili, CLIENTE_SIN_NOMBRE, type Modulo, type Nivel } from '@moldeados/shared';
import { db } from '../db.js';
import { matriz, requerir, requerirAlguno } from '../lib/auth.js';
import { auditar } from '../lib/auditoria.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../lib/errors.js';

// Importar planillas (Excel/CSV). La app lee el archivo y manda las filas ya mapeadas a nuestros campos; acá se
// valida fila por fila y, en modo "probar", no se guarda nada: se devuelve qué pasaría y los errores con su n.º de
// fila. En modo "importar" va todo en UNA transacción: o entra la planilla entera o nada.

type Fila = Record<string, unknown>;
interface Resultado { nuevos: number; actualizados: number; sinCambios: number; errores: { fila: number; mensaje: string }[] }
interface Tipo {
  titulo: string;
  modulo: Modulo;
  nivel: Nivel;
  campos: { id: string; titulo: string; obligatorio?: boolean; ejemplo: string; parecidos: string[] }[];
  procesar: (trx: Knex.Transaction, filas: Fila[], usuarioId: string, r: Resultado, opciones: { actualizar: boolean; fecha: string }) => Promise<void>;
}

/** N.º de fila en el Excel (la app lo manda en _fila: puede haber títulos o filas vacías arriba). */
const nf = (f: Fila, i: number) => Number(f._fila) || i + 2;
const txt = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());
const nulo = (v: unknown) => txt(v) || null;
const pesos = (v: unknown) => (typeof v === 'number' ? aCentavos(v) : aCentavos(txt(v).replace(/^\$\s*/, '')));
const cantidad = (v: unknown) => (typeof v === 'number' ? aMili(v) : aMili(txt(v).replace(/\s*(kg|l|lts?|litros?|kilos?)$/i, '')));
const clave = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const fechaIso = (v: unknown, defecto: string): string | null => {
  if (v === null || v === undefined || txt(v) === '') return defecto;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = txt(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(s); // dd/mm/aaaa, como se escribe acá
  if (!m) return null;
  const y = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
  return `${y}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
};

/** Busca por nombre (sin mayúsculas ni acentos); si no existe y se puede, lo crea. */
async function porNombre(trx: Knex.Transaction, tabla: 'clientes' | 'proveedores', nombre: string, crear: boolean): Promise<{ id: string; creado: boolean } | null> {
  const fila = await trx(tabla).whereNull('deleted_at').whereRaw('lower(unaccent(nombre)) = lower(unaccent(?))', [nombre]).first('id');
  if (fila) return { id: fila.id, creado: false };
  if (!crear) return null;
  const [n] = await trx(tabla).insert({ nombre }).returning('id');
  return { id: n.id, creado: true };
}

const TIPOS_MP: [RegExp, string][] = [[/cart[oó]n|papel/i, 'carton'], [/tinta|color|colorante/i, 'tinta'], [/aglutin|encolant|cola/i, 'aglutinante']];

function contactos(tabla: 'clientes' | 'proveedores'): Tipo['procesar'] {
  return async (trx, filas, usuarioId, r, { actualizar }) => {
    const vistos = new Set<string>();
    for (const [i, f] of filas.entries()) {
      const nombre = txt(f.nombre);
      if (nombre.length < 2) { r.errores.push({ fila: nf(f, i), mensaje: 'Falta el nombre' }); continue; }
      if (vistos.has(clave(nombre))) { r.errores.push({ fila: nf(f, i), mensaje: `"${nombre}" está repetido en la planilla` }); continue; }
      vistos.add(clave(nombre));
      const cuit = nulo(f.cuit);
      if (cuit && !/^\d{2}-?\d{8}-?\d$/.test(cuit.replace(/\s/g, ''))) { r.errores.push({ fila: nf(f, i), mensaje: `El CUIT "${cuit}" no es válido` }); continue; }
      const datos: Fila = { cuit, telefono: nulo(f.telefono), email: nulo(f.email), direccion: nulo(f.direccion), notas: nulo(f.notas) };
      if (tabla === 'proveedores') datos.tipos = [...new Set(TIPOS_MP.filter(([re]) => re.test(txt(f.vende))).map(([, t]) => t))];
      for (const k of Object.keys(datos)) if (datos[k] === null || (Array.isArray(datos[k]) && !(datos[k] as unknown[]).length)) delete datos[k];
      const existe = await porNombre(trx, tabla, nombre, false);
      if (existe) {
        if (actualizar && Object.keys(datos).length) { await trx(tabla).where({ id: existe.id }).update({ ...datos, updated_at: trx.fn.now() }); r.actualizados++; }
        else r.sinCambios++;
      } else {
        const [n] = await trx(tabla).insert({ nombre, ...datos }).returning('id');
        await auditar(trx, { usuarioId, accion: 'crear', entidad: tabla === 'clientes' ? 'cliente' : 'proveedor', entidadId: n.id, despues: { nombre, ...datos }, motivo: 'Importado de planilla' });
        r.nuevos++;
      }
    }
  };
}

function saldos(tabla: 'clientes' | 'proveedores'): Tipo['procesar'] {
  return async (trx, filas, usuarioId, r, { fecha }) => {
    for (const [i, f] of filas.entries()) {
      const nombre = txt(f.nombre);
      const monto = pesos(f.saldo);
      const dia = fechaIso(f.fecha, fecha);
      if (nombre.length < 2) { r.errores.push({ fila: nf(f, i), mensaje: 'Falta el nombre' }); continue; }
      if (monto === null) { r.errores.push({ fila: nf(f, i), mensaje: `El saldo "${txt(f.saldo)}" no es un número` }); continue; }
      if (!dia) { r.errores.push({ fila: nf(f, i), mensaje: `La fecha "${txt(f.fecha)}" no se entiende (usá dd/mm/aaaa)` }); continue; }
      if (monto === 0) { r.sinCambios++; continue; }
      const quien = (await porNombre(trx, tabla, nombre, true))!;
      // Subir la misma planilla dos veces no duplica la deuda: el saldo de esa fecha se reemplaza.
      const col = tabla === 'clientes' ? 'cliente_id' : 'proveedor_id';
      const previo = await trx('saldos_iniciales').where({ [col]: quien.id, fecha: dia }).whereNull('anulado_at').first('id', 'monto_centavos');
      if (previo && Number(previo.monto_centavos) === monto) { r.sinCambios++; continue; }
      if (previo) await trx('saldos_iniciales').where({ id: previo.id }).update({ anulado_at: trx.fn.now() });
      await trx('saldos_iniciales').insert({ [tabla === 'clientes' ? 'cliente_id' : 'proveedor_id']: quien.id, fecha: dia, monto_centavos: monto, nota: nulo(f.nota) ?? 'Saldo inicial importado', usuario_id: usuarioId });
      await auditar(trx, { usuarioId, accion: 'crear', entidad: tabla === 'clientes' ? 'cliente' : 'proveedor', entidadId: quien.id, despues: { saldoInicial: monto, fecha: dia }, motivo: 'Saldo inicial importado' });
      if (previo) r.actualizados++; else r.nuevos++;
    }
  };
}

const TIPOS: Record<string, Tipo> = {
  clientes: {
    titulo: 'Clientes', modulo: 'ventas', nivel: 2, procesar: contactos('clientes'),
    campos: [
      { id: 'nombre', titulo: 'Nombre o razón social', obligatorio: true, ejemplo: 'Granja Los Álamos', parecidos: ['nombre', 'cliente', 'razon social', 'razón social', 'empresa'] },
      { id: 'cuit', titulo: 'CUIT', ejemplo: '30-71234567-8', parecidos: ['cuit', 'cuil', 'cuit/cuil'] },
      { id: 'telefono', titulo: 'Teléfono', ejemplo: '351 555-1234', parecidos: ['telefono', 'teléfono', 'tel', 'celular', 'whatsapp', 'cel'] },
      { id: 'email', titulo: 'Email', ejemplo: 'compras@granja.com', parecidos: ['email', 'mail', 'correo'] },
      { id: 'direccion', titulo: 'Dirección', ejemplo: 'Ruta 9 km 12', parecidos: ['direccion', 'dirección', 'domicilio', 'localidad'] },
      { id: 'notas', titulo: 'Notas', ejemplo: '', parecidos: ['notas', 'observaciones', 'obs', 'comentarios'] },
    ],
  },
  proveedores: {
    titulo: 'Proveedores', modulo: 'proveedores', nivel: 2, procesar: contactos('proveedores'),
    campos: [
      { id: 'nombre', titulo: 'Nombre o razón social', obligatorio: true, ejemplo: 'Reciclados Sur', parecidos: ['nombre', 'proveedor', 'razon social', 'razón social', 'empresa'] },
      { id: 'cuit', titulo: 'CUIT', ejemplo: '20-12345678-3', parecidos: ['cuit', 'cuil'] },
      { id: 'telefono', titulo: 'Teléfono', ejemplo: '351 444-9876', parecidos: ['telefono', 'teléfono', 'tel', 'celular'] },
      { id: 'email', titulo: 'Email', ejemplo: '', parecidos: ['email', 'mail', 'correo'] },
      { id: 'direccion', titulo: 'Dirección', ejemplo: '', parecidos: ['direccion', 'dirección', 'domicilio'] },
      { id: 'vende', titulo: 'Qué vende', ejemplo: 'Cartón', parecidos: ['vende', 'rubro', 'producto', 'materia prima', 'tipo'] },
      { id: 'notas', titulo: 'Notas', ejemplo: '', parecidos: ['notas', 'observaciones', 'obs'] },
    ],
  },
  stock: {
    titulo: 'Stock inicial de materia prima', modulo: 'materias', nivel: 3,
    campos: [
      { id: 'materia', titulo: 'Materia prima', obligatorio: true, ejemplo: 'Cartón', parecidos: ['materia prima', 'materia', 'producto', 'insumo', 'descripcion', 'descripción'] },
      { id: 'cantidad', titulo: 'Cantidad que hay', obligatorio: true, ejemplo: '12500', parecidos: ['cantidad', 'stock', 'existencia', 'kg', 'litros', 'total'] },
      { id: 'unidad', titulo: 'Unidad (kg o L)', ejemplo: 'kg', parecidos: ['unidad', 'um', 'medida'] },
    ],
    procesar: async (trx, filas, usuarioId, r) => {
      for (const [i, f] of filas.entries()) {
        const nombre = txt(f.materia);
        const cant = cantidad(f.cantidad);
        if (nombre.length < 2) { r.errores.push({ fila: nf(f, i), mensaje: 'Falta la materia prima' }); continue; }
        if (cant === null || cant < 0) { r.errores.push({ fila: nf(f, i), mensaje: `La cantidad "${txt(f.cantidad)}" no es válida` }); continue; }
        let mp = await trx('materias_primas').whereNull('deleted_at').whereRaw('lower(unaccent(nombre)) = lower(unaccent(?))', [nombre]).first('id');
        if (!mp) {
          const tipo = TIPOS_MP.find(([re]) => re.test(nombre))?.[1] ?? 'otro';
          const u = txt(f.unidad).toLowerCase();
          const unidad = /^l|lit/.test(u) ? 'l' : /^k/.test(u) ? 'kg' : tipo === 'carton' ? 'kg' : tipo === 'otro' ? null : 'l';
          if (!unidad) { r.errores.push({ fila: nf(f, i), mensaje: `"${nombre}" no existe: indicá la unidad (kg o L) para crearla` }); continue; }
          [mp] = await trx('materias_primas').insert({ nombre, tipo, unidad }).returning('id');
        }
        // "Stock inicial" deja el stock en lo que dice la planilla: se carga la diferencia. Reimportar no duplica.
        const actual = Number((await trx('movimientos_stock').where({ materia_prima_id: mp.id }).sum('cantidad as s').first())?.s ?? 0);
        if (cant === actual) { r.sinCambios++; continue; }
        await trx('movimientos_stock').insert({ materia_prima_id: mp.id, cantidad: cant - actual, motivo: 'ajuste', nota: 'Stock inicial importado de planilla', usuario_id: usuarioId });
        await auditar(trx, { usuarioId, accion: 'ajustar', entidad: 'materia_prima', entidadId: mp.id, despues: { stock: cant }, motivo: 'Stock inicial importado' });
        if (actual === 0) r.nuevos++; else r.actualizados++;
      }
    },
  },
  'saldos-clientes': {
    titulo: 'Saldos iniciales de clientes', modulo: 'cuentas', nivel: 3, procesar: saldos('clientes'),
    campos: [
      { id: 'nombre', titulo: 'Cliente', obligatorio: true, ejemplo: 'Granja Los Álamos', parecidos: ['cliente', 'nombre', 'razon social', 'razón social'] },
      { id: 'saldo', titulo: 'Saldo (lo que debe)', obligatorio: true, ejemplo: '150000,50', parecidos: ['saldo', 'debe', 'deuda', 'importe', 'monto', 'total'] },
      { id: 'fecha', titulo: 'Fecha del saldo', ejemplo: '31/10/2026', parecidos: ['fecha', 'al'] },
      { id: 'nota', titulo: 'Nota', ejemplo: '', parecidos: ['nota', 'detalle', 'observaciones', 'concepto'] },
    ],
  },
  'saldos-proveedores': {
    titulo: 'Saldos iniciales de proveedores', modulo: 'cuentas', nivel: 3, procesar: saldos('proveedores'),
    campos: [
      { id: 'nombre', titulo: 'Proveedor', obligatorio: true, ejemplo: 'Reciclados Sur', parecidos: ['proveedor', 'nombre', 'razon social', 'razón social'] },
      { id: 'saldo', titulo: 'Saldo (lo que le debemos)', obligatorio: true, ejemplo: '80000', parecidos: ['saldo', 'debe', 'deuda', 'importe', 'monto', 'total', 'haber'] },
      { id: 'fecha', titulo: 'Fecha del saldo', ejemplo: '31/10/2026', parecidos: ['fecha', 'al'] },
      { id: 'nota', titulo: 'Nota', ejemplo: '', parecidos: ['nota', 'detalle', 'observaciones', 'concepto'] },
    ],
  },
  ventas: {
    titulo: 'Ventas anteriores (hoja VENTAS de la planilla de finanzas)', modulo: 'ventas', nivel: 3,
    campos: [
      { id: 'fecha', titulo: 'Fecha', obligatorio: true, ejemplo: '04/08/2026', parecidos: ['fecha'] },
      { id: 'comprobante', titulo: 'N° comprobante', ejemplo: '295 o A-141', parecidos: ['n° comprobante', 'nro comprobante', 'comprobante', 'remito', 'factura'] },
      { id: 'cliente', titulo: 'Cliente', ejemplo: 'Avícola Santa Rosa', parecidos: ['cliente', 'razon social', 'razón social'] },
      { id: 'codigo', titulo: 'Código del maple', ejemplo: 'MGR-NAT', parecidos: ['codigo', 'código', 'producto', 'maple'] },
      { id: 'calidad', titulo: 'Calidad (Primera / Segunda)', ejemplo: 'Primera', parecidos: ['calidad'] },
      { id: 'cantidad', titulo: 'Cantidad (maples)', ejemplo: '6.480', parecidos: ['cantidad (maples)', 'cantidad', 'maples'] },
      { id: 'precio', titulo: 'Precio unitario ($/maple)', ejemplo: '120,00', parecidos: ['precio unitario ($/maple)', 'precio unitario', 'precio'] },
      { id: 'monto', titulo: 'Monto ($)', obligatorio: true, ejemplo: '777.600', parecidos: ['monto ($)', 'monto', 'total', 'importe'] },
      { id: 'efectivo', titulo: 'Efectivo ($)', ejemplo: '777.600', parecidos: ['efectivo ($)', 'efectivo'] },
      { id: 'transferencia', titulo: 'Transferencia ($)', ejemplo: '', parecidos: ['transferencia ($)', 'transferencia'] },
      { id: 'cheque', titulo: 'Cheque ($)', ejemplo: '', parecidos: ['cheque ($)', 'cheque', 'echeq'] },
      { id: 'estado', titulo: 'Estado (Cobrado / Pendiente)', ejemplo: 'Cobrado', parecidos: ['estado'] },
      { id: 'registro', titulo: 'Registrado por', ejemplo: 'Evangelina', parecidos: ['registrado por', 'registro', 'cargo'] },
      { id: 'notas', titulo: 'Observaciones', ejemplo: '', parecidos: ['observaciones', 'obs', 'notas'] },
    ],
    // Ventas de antes de usar el sistema: entran sin palet (no tocan el stock de maples). Lo pagado en el momento
    // se registra como cobros del cliente; sin cliente, van a "Clientes sin nombre (planilla)". Las facturadas
    // (comprobante A-…) traen el precio con IVA: se separa el 21 %.
    procesar: async (trx, filas, usuarioId, r, { fecha: hoy }) => {
      const variantes = await trx('variantes').whereNull('deleted_at').select('id', 'codigo');
      if (!variantes.length) { r.errores.push({ fila: 1, mensaje: 'Primero creá al menos un código de maple en Ajustes › Maples y recetas' }); return; }
      // Sin código en la planilla: el que más se produjo (o el primero).
      const masProducido = (await trx('partes').whereNull('anulado_at').groupBy('variante_id').orderByRaw('sum(paquetes) desc').first('variante_id'))?.variante_id;
      const porDefecto = masProducido ?? variantes.sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)))[0]!.id;
      let banco: string | null = null;
      const bancoCheques = async () => {
        if (banco) return banco;
        const b = await trx('bancos').whereNull('deleted_at').where({ nombre: 'Sin datos (planilla)' }).first('id');
        banco = b?.id ?? (await trx('bancos').insert({ nombre: 'Sin datos (planilla)' }).returning('id'))[0].id;
        return banco!;
      };
      const usados = new Set((await trx('ventas').select('numero')).map((v) => Number(v.numero)));
      const vistas = new Map<string, number>();
      // Las ventas sin número de remito (facturas sueltas) toman números después del remito más alto de la planilla.
      const maxPlanilla = Math.max(0, ...filas.map((f) => Number(/^(\d{1,9})\b/.exec(txt(f.comprobante))?.[1] ?? 0)));
      await trx.raw("select setval('ventas_numero_seq', greatest((select coalesce(max(numero), 0) from ventas), ?, 1))", [maxPlanilla]);
      for (const [i, f] of filas.entries()) {
        const montoTxt = txt(f.monto);
        if (!txt(f.cantidad) && (!montoTxt || /^\$?\s*0*([.,]0+)?$/.test(montoTxt))) continue; // renglón vacío
        const dia = fechaIso(f.fecha, '');
        const total = pesos(f.monto);
        if (!dia) { r.errores.push({ fila: nf(f, i), mensaje: `Falta la fecha o no se entiende ("${txt(f.fecha)}")` }); continue; }
        if (total === 0) continue; // sin monto (muestra, regalo): no es una venta
        if (total === null || total < 0) { r.errores.push({ fila: nf(f, i), mensaje: `El monto "${montoTxt}" no es válido` }); continue; }
        let maples = Math.round(Number(txt(f.cantidad).replace(/\./g, '').replace(',', '.')) || 0);
        const precioTxt = pesos(f.precio);
        if (!maples && precioTxt) maples = Math.round(total / precioTxt);
        if (maples <= 0) { r.errores.push({ fila: nf(f, i), mensaje: 'Falta la cantidad de maples' }); continue; }
        const comp = txt(f.comprobante);
        const factura = /\b[A-C]\s*[-.]\s*\d+/i.exec(comp)?.[0].replace(/\s|\./g, '').replace(/^([A-C])(\d)/i, '$1-$2').toUpperCase() ?? null;
        const remito = /^(\d{1,9})\b/.exec(comp)?.[1] ? Number(/^(\d{1,9})\b/.exec(comp)![1]) : null;
        const conFactura = !!factura;
        const neto = conFactura ? Math.round(total / 1.21) : total;
        const nombre = txt(f.cliente) || CLIENTE_SIN_NOMBRE;
        const cli = (await porNombre(trx, 'clientes', nombre, true))!;
        let varianteId = porDefecto;
        if (txt(f.codigo)) {
          const v = variantes.find((x) => String(x.codigo).toUpperCase() === txt(f.codigo).toUpperCase());
          if (!v) { r.errores.push({ fila: nf(f, i), mensaje: `No hay ningún maple con código "${txt(f.codigo)}"` }); continue; }
          varianteId = v.id;
        }
        const notas = [comp && `Comprobante de la planilla: ${comp}`, txt(f.registro) && `registrado por ${txt(f.registro)}`, txt(f.notas)].filter(Boolean).join(' · ') || null;
        // Reimportar no duplica: misma fecha, cliente, total y comprobante. Renglones iguales en la planilla son ventas
        // distintas (ej. cuatro ventas de 2.160 maples el mismo día sin comprobante): se cuentan.
        const k = [dia, cli.id, total, notas ?? ''].join('|');
        vistas.set(k, (vistas.get(k) ?? 0) + 1);
        const yaHay = Number((await trx('ventas').whereNull('anulado_at').where({ fecha: dia, cliente_id: cli.id, total_centavos: total }).whereRaw('coalesce(notas, \'\') = coalesce(?, \'\')', [notas]).count<{ n: number }[]>('* as n'))[0]?.n ?? 0);
        if (vistas.get(k)! <= yaHay) { r.sinCambios++; continue; }
        const numero = remito && !usados.has(remito) ? remito : undefined;
        if (numero) usados.add(numero);
        const [v] = await trx('ventas').insert({
          ...(numero && { numero }), cliente_id: cli.id, fecha: dia, con_factura: conFactura, nro_factura: factura, iva_bp: conFactura ? 2100 : 0,
          neto_centavos: neto, iva_centavos: total - neto, total_centavos: total, retira: null, notas, usuario_id: usuarioId,
        }).returning(['id', 'numero']);
        await trx('venta_items').insert({ venta_id: v.id, palet_id: null, variante_id: varianteId, maples, precio_maple_centavos: Math.round(neto / maples), subtotal_centavos: neto,
          calidad: /^(2|seg)/i.test(txt(f.calidad)) ? 'segunda' : 'primera' });
        // Lo pagado. "Pendiente" con todo pagado: la plata no llegó todavía (así lo usan en la planilla), no se registra.
        const pagos = (['efectivo', 'transferencia', 'cheque'] as const).map((m) => ({ m, monto: pesos(f[m]) ?? 0 })).filter((p) => p.monto > 0);
        const pagado = pagos.reduce((a, p) => a + p.monto, 0);
        const pendiente = /pend/i.test(txt(f.estado));
        const aRegistrar = pendiente && pagado >= total ? [] : pagado === 0 && /cobrad/i.test(txt(f.estado)) ? [{ m: /cheq/i.test(txt(f.notas)) ? 'cheque' as const : 'efectivo' as const, monto: total }] : pagos;
        for (const p of aRegistrar) {
          await trx('movimientos_dinero').insert({ tipo: 'cobro', cliente_id: cli.id, fecha: dia, monto_centavos: p.monto, medio: p.m === 'cheque' ? 'echeq' : p.m,
            banco_id: p.m === 'cheque' ? await bancoCheques() : null, referencia: `Remito ${String(v.numero).padStart(6, '0')}`, notas: 'Importado de la planilla de finanzas', usuario_id: usuarioId });
        }
        await auditar(trx, { usuarioId, accion: 'crear', entidad: 'venta', entidadId: v.id, despues: { fecha: dia, total, maples, comprobante: comp }, motivo: 'Importado de la planilla de finanzas' });
        r.nuevos++;
      }
      // Los remitos nuevos siguen después del más alto importado.
      await trx.raw("select setval('ventas_numero_seq', greatest((select coalesce(max(numero), 0) from ventas), 1))");
      void hoy;
    },
  },
  egresos: {
    titulo: 'Egresos (hoja EGRESOS de la planilla de finanzas)', modulo: 'gastos', nivel: 3,
    campos: [
      { id: 'fecha', titulo: 'Fecha', obligatorio: true, ejemplo: '03/08/2026', parecidos: ['fecha'] },
      { id: 'comprobante', titulo: 'N° comprobante', ejemplo: 'A-3169', parecidos: ['n° comprobante', 'nro comprobante', 'comprobante', 'factura', 'n° factura'] },
      { id: 'beneficiario', titulo: 'Proveedor / beneficiario', ejemplo: 'ELECTRO ALEM', parecidos: ['proveedor / beneficiario', 'proveedor', 'beneficiario', 'a quien'] },
      { id: 'descripcion', titulo: 'Concepto / descripción', obligatorio: true, ejemplo: 'Materiales eléctricos', parecidos: ['concepto / descripción', 'concepto', 'descripcion', 'descripción', 'detalle'] },
      { id: 'categoria', titulo: 'Categoría', ejemplo: 'Mantenimiento', parecidos: ['categoria', 'categoría', 'rubro'] },
      { id: 'forma', titulo: 'Forma de pago', ejemplo: 'Transferencia', parecidos: ['forma de pago', 'medio', 'medio de pago', 'pago'] },
      { id: 'monto', titulo: 'Monto ($)', obligatorio: true, ejemplo: '159.500', parecidos: ['monto ($)', 'monto', 'importe', 'total'] },
      { id: 'usd', titulo: 'Monto (USD)', ejemplo: 'US$ 4.053,50', parecidos: ['monto (usd)', 'usd', 'dolares', 'dólares'] },
      { id: 'estado', titulo: 'Estado (Pagado / Pendiente)', ejemplo: 'Pagado', parecidos: ['estado'] },
      { id: 'notas', titulo: 'Observaciones', ejemplo: '', parecidos: ['observaciones', 'obs', 'notas'] },
    ],
    procesar: async (trx, filas, usuarioId, r) => {
      // Sus categorías con nombre parecido a las nuestras; si no existe, se crea con el nombre de la planilla.
      const ALIAS: Record<string, string> = { mantenimiento: 'mantenimiento y repuestos', sueldos: 'sueldos y adelantos', epec: 'epec (luz)', luz: 'epec (luz)', 'gastos de estudio': 'gastos de estudio' };
      const categorias = new Map((await trx('categorias_gasto').whereNull('deleted_at').select('id', 'nombre')).map((c) => [clave(c.nombre), c.id as string]));
      const categoria = async (nombre: string) => {
        const k = clave(nombre || 'Varios');
        const id = categorias.get(ALIAS[k] ?? k);
        if (id) return id;
        const [c] = await trx('categorias_gasto').insert({ nombre: nombre.trim() }).returning('id');
        categorias.set(k, c.id);
        return c.id as string;
      };
      const vistos = new Map<string, number>();
      for (const [i, f] of filas.entries()) {
        const descripcion = txt(f.descripcion);
        const montoTxt = txt(f.monto).replace(/^\$\s*/, '');
        if (!descripcion && (!montoTxt || /^0*([.,]0+)?$/.test(montoTxt))) continue; // renglón vacío de la planilla
        const dia = fechaIso(f.fecha, '');
        const monto = pesos(f.monto);
        if (!dia) { r.errores.push({ fila: nf(f, i), mensaje: `Falta la fecha o no se entiende ("${txt(f.fecha)}")` }); continue; }
        if (descripcion.length < 2) { r.errores.push({ fila: nf(f, i), mensaje: 'Falta el concepto' }); continue; }
        if (monto === null || monto <= 0) { r.errores.push({ fila: nf(f, i), mensaje: `El monto "${txt(f.monto)}" no es válido` }); continue; }
        const usdTxt = txt(f.usd).replace(/^(us\$|u\$s|usd)\s*/i, '');
        const usd = usdTxt ? pesos(usdTxt) : null;
        if (usdTxt && (usd === null || usd <= 0)) { r.errores.push({ fila: nf(f, i), mensaje: `El monto en dólares "${txt(f.usd)}" no es válido` }); continue; }
        const pendiente = /pend/i.test(txt(f.estado));
        const forma = clave(txt(f.forma));
        const medio = pendiente ? null : /transf/.test(forma) ? 'transferencia' : /echeq|e-cheq/.test(forma) ? 'echeq' : /cheq/.test(forma) ? 'cheque' : /mercado|mp/.test(forma) ? 'mercado_pago' : 'efectivo';
        const beneficiario = nulo(f.beneficiario);
        // Reimportar no duplica: cuenta los renglones iguales (día, concepto, monto, beneficiario) de la planilla contra
        // los ya cargados; dos renglones iguales en la planilla son dos egresos.
        const k = [dia, monto, descripcion.toLowerCase(), (beneficiario ?? '').toLowerCase()].join('|');
        vistos.set(k, (vistos.get(k) ?? 0) + 1);
        const yaHay = Number((await trx('gastos').whereNull('anulado_at').where({ fecha: dia, monto_centavos: monto }).whereRaw('lower(descripcion) = lower(?)', [descripcion])
          .whereRaw('coalesce(lower(beneficiario), \'\') = coalesce(lower(?), \'\')', [beneficiario]).count<{ n: number }[]>('* as n'))[0]?.n ?? 0);
        if (vistos.get(k)! <= yaHay) { r.sinCambios++; continue; }
        const comprobante = nulo(f.comprobante);
        const [g] = await trx('gastos').insert({
          fecha: dia, categoria_id: await categoria(txt(f.categoria)), descripcion: descripcion.slice(0, 200), monto_centavos: monto, medio,
          con_factura: !!comprobante && /^[abc]-?\d/i.test(comprobante), nro_factura: comprobante, beneficiario, a_pagar: pendiente, monto_usd_centavos: usd,
          notas: nulo(f.notas), usuario_id: usuarioId,
        }).returning('id');
        await auditar(trx, { usuarioId, accion: 'crear', entidad: 'gasto', entidadId: g.id, despues: { fecha: dia, descripcion, monto }, motivo: 'Importado de la planilla de finanzas' });
        r.nuevos++;
      }
    },
  },
  precios: {
    titulo: 'Lista de precios', modulo: 'ventas', nivel: 3,
    campos: [
      { id: 'codigo', titulo: 'Código del maple', obligatorio: true, ejemplo: 'MGR-ROJ', parecidos: ['codigo', 'código', 'cod', 'articulo', 'artículo', 'producto'] },
      { id: 'precio', titulo: 'Precio por maple (sin IVA)', obligatorio: true, ejemplo: '150,50', parecidos: ['precio por maple', 'precio', 'precio unitario', 'unitario', 'lista', 'importe'] },
    ],
    procesar: async (trx, filas, usuarioId, r) => {
      for (const [i, f] of filas.entries()) {
        const codigo = txt(f.codigo).toUpperCase();
        const precio = pesos(f.precio);
        if (!codigo) { r.errores.push({ fila: nf(f, i), mensaje: 'Falta el código' }); continue; }
        if (precio === null || precio < 0) { r.errores.push({ fila: nf(f, i), mensaje: `El precio "${txt(f.precio)}" no es válido` }); continue; }
        const v = await trx('variantes').whereNull('deleted_at').whereRaw('upper(codigo) = ?', [codigo]).first('id', 'precio_maple_centavos');
        if (!v) { r.errores.push({ fila: nf(f, i), mensaje: `No hay ningún maple con código "${codigo}": crealo en Ajustes › Maples y recetas` }); continue; }
        if (Number(v.precio_maple_centavos) === precio) { r.sinCambios++; continue; }
        await trx('variantes').where({ id: v.id }).update({ precio_maple_centavos: precio, updated_at: trx.fn.now() });
        await auditar(trx, { usuarioId, accion: 'editar', entidad: 'precio', entidadId: v.id, antes: { precio: Number(v.precio_maple_centavos) }, despues: { precio }, motivo: 'Importado de planilla' });
        r.actualizados++;
      }
    },
  },
};

const cuerpo = z.object({
  modo: z.enum(['probar', 'importar']),
  actualizar: z.boolean().default(false),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  filas: z.array(z.record(z.unknown())).min(1, 'La planilla no tiene filas').max(5000, 'Son demasiadas filas: partí la planilla en partes de hasta 5.000'),
});

/** Cuando se "prueba", la transacción se deshace al final con este error. */
class Ensayo extends Error {}

export async function importarRoutes(app: FastifyInstance): Promise<void> {
  app.get('/importar', async (req) => {
    const s = await requerirAlguno(db, req, Object.values(TIPOS).map((t) => [t.modulo, t.nivel]));
    const m = (await matriz(db))[s.rol];
    return { data: Object.entries(TIPOS).filter(([, t]) => m[t.modulo] >= t.nivel).map(([id, t]) => ({ id, titulo: t.titulo, campos: t.campos })) };
  });

  app.post<{ Params: { tipo: string } }>('/importar/:tipo', { bodyLimit: 10 * 1024 * 1024 }, async (req) => {
    const tipo = TIPOS[req.params.tipo];
    if (!tipo) throw new NotFoundError('No se puede importar eso');
    const s = await requerir(db, req, tipo.modulo, tipo.nivel).catch(() => { throw new ForbiddenError('Tu usuario no puede importar esto'); });
    const i = cuerpo.parse(req.body);
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
    const r: Resultado = { nuevos: 0, actualizados: 0, sinCambios: 0, errores: [] };
    try {
      await db.transaction(async (trx) => {
        await tipo.procesar(trx, i.filas, s.usuarioId, r, { actualizar: i.actualizar, fecha: i.fecha ?? hoy });
        // Con errores no se importa nada: se corrige la planilla y se vuelve a subir.
        if (i.modo === 'probar' || r.errores.length) throw new Ensayo();
        await auditar(trx, { usuarioId: s.usuarioId, accion: 'crear', entidad: 'importacion', motivo: `${tipo.titulo}: ${r.nuevos} nuevos, ${r.actualizados} actualizados` });
      });
    } catch (e) {
      if (!(e instanceof Ensayo)) throw e;
    }
    if (i.modo === 'importar' && r.errores.length) throw new ValidationError(`La planilla tiene ${r.errores.length} filas con errores: no se importó nada. Revisalas y volvé a subirla.`);
    return { data: { ...r, importado: i.modo === 'importar' } };
  });
}
