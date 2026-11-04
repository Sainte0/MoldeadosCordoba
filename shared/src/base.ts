// Constantes, cálculos y tipos del dominio, SIN Zod: es lo que usa la app (así Zod no viaja al navegador).
// Los schemas de entrada viven en index.ts, que además re-exporta todo esto para el backend.

/** "1.234,56" | "1234.56" | 1234.56 → enteros escalados. null si no es un número válido. */
function escalar(valor: string | number, factor: number): number | null {
  // Un número de verdad (por ejemplo una celda numérica de Excel) ya está bien: 1.234 kg son 1.234 kg, no 1234.
  if (typeof valor === 'number') return Number.isFinite(valor) ? Math.round(valor * factor) : null;
  let s = String(valor).trim().replace(/\s/g, '');
  // Formato argentino: la coma es decimal y el punto separa miles ("8.420" = ocho mil cuatrocientos veinte,
  // como lo muestra la báscula). Sin coma, el punto es decimal solo si no forma grupos de miles ("12.5").
  if (s.includes(',') || /^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Math.round(Number(s) * factor);
}

export const aCentavos = (v: string | number) => escalar(v, 100);

/** kg → gramos, litros → mililitros. */
export const aMili = (v: string | number) => escalar(v, 1000);

const pesos = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });

export const formatPesos = (centavos: number) => pesos.format(centavos / 100);

export type Unidad = 'kg' | 'l';

const num = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 3 });

export const formatCantidad = (mili: number, unidad: Unidad) => `${num.format(mili / 1000)} ${unidad === 'kg' ? 'kg' : 'L'}`;

// ---------- IVA y totales de compra ----------

/** Alícuotas en puntos básicos (21 % = 2100). 0 = sin IVA discriminado. */
export const ALICUOTAS_IVA = [0, 1050, 2100, 2700] as const;

export const formatIva = (bp: number) => (bp === 0 ? 'Sin IVA' : `${num.format(bp / 100)} %`);

/** Subtotal de un ítem: cantidad en mili × precio por unidad entera (kg/L) en centavos. */
export const subtotalItem = (cantidadMili: number, precioUnitarioCentavos: number) =>
  Math.round((cantidadMili * precioUnitarioCentavos) / 1000);

export function calcularCompra(items: { cantidad: number; precioUnitario: number }[], ivaBp: number) {
  const neto = items.reduce((acc, i) => acc + subtotalItem(i.cantidad, i.precioUnitario), 0);
  const iva = Math.round((neto * ivaBp) / 10000);
  return { neto, iva, total: neto + iva };
}

// ---------- Roles y permisos ----------

export const ROLES = ['dueno', 'administracion', 'encargado', 'operario'] as const;

export type Rol = (typeof ROLES)[number];

export const LABEL_ROL: Record<Rol, string> = {
  dueno: 'Dueño',
  administracion: 'Administración',
  encargado: 'Encargado de planta',
  operario: 'Operario',
};

export const MODULOS = [
  { id: 'produccion', label: 'Producción y palets', detalle: 'Partes de producción por turno, stock de maples, armado de palets y etiquetas.' },
  { id: 'productos', label: 'Maples, recetas y máquinas', detalle: 'Códigos de maple, cuánto consume cada uno por hora y las máquinas.' },
  { id: 'tablero', label: 'Tablero del dueño', detalle: 'Ventas, compras, gastos, producción y resultado del período.' },
  { id: 'gastos', label: 'Gastos y caja chica', detalle: 'Cargar gastos con su comprobante y manejar la caja chica.' },
  { id: 'ventas', label: 'Ventas, clientes y precios', detalle: 'Vender palets, datos de clientes y lista de precios.' },
  { id: 'cuentas', label: 'Cobros, pagos y cuentas corrientes', detalle: 'Cobrar a clientes, pagar a proveedores, cheques y saldos.' },
  { id: 'compras', label: 'Pesajes y compras', detalle: 'Ingreso de cartón con ticket de pesaje y compras de tinta, aglutinante y otros.' },
  { id: 'proveedores', label: 'Proveedores', detalle: 'Datos de cada proveedor y lo que se le compró.' },
  { id: 'materias', label: 'Materia prima', detalle: 'Stock de cartón, tintas y aglutinante, y correcciones de stock.' },
  { id: 'usuarios', label: 'Equipo y permisos', detalle: 'Altas y bajas de usuarios y qué puede hacer cada rol.' },
  { id: 'auditoria', label: 'Registro de cambios', detalle: 'Quién hizo cada cosa y cuándo.' },
] as const;

export type Modulo = (typeof MODULOS)[number]['id'];

/** 0 ninguno · 1 ver · 2 cargar · 3 editar y anular. Cada nivel incluye a los anteriores. */
export const NIVELES = ['Sin acceso', 'Ver', 'Ver y cargar', 'Todo (editar y anular)'] as const;

export type Nivel = 0 | 1 | 2 | 3;

export type MatrizPermisos = Record<Rol, Record<Modulo, Nivel>>;

/** Default de fábrica. La tabla rol_permisos guarda solo lo que el dueño cambió. El dueño ve todo siempre. */
export const PERMISOS_DEFAULT: MatrizPermisos = {
  dueno: { tablero: 1, gastos: 3, ventas: 3, cuentas: 3, produccion: 3, productos: 3, compras: 3, proveedores: 3, materias: 3, usuarios: 3, auditoria: 1 },
  administracion: { tablero: 1, gastos: 3, ventas: 3, cuentas: 3, produccion: 1, productos: 1, compras: 3, proveedores: 3, materias: 1, usuarios: 0, auditoria: 1 },
  encargado: { tablero: 0, gastos: 2, ventas: 2, cuentas: 0, produccion: 3, productos: 3, compras: 2, proveedores: 2, materias: 3, usuarios: 0, auditoria: 0 },
  operario: { tablero: 0, gastos: 0, ventas: 0, cuentas: 0, produccion: 2, productos: 1, compras: 2, proveedores: 1, materias: 1, usuarios: 0, auditoria: 0 },
};

export function armarMatriz(overrides: { rol: string; modulo: string; nivel: number }[]): MatrizPermisos {
  const m = structuredClone(PERMISOS_DEFAULT);
  for (const o of overrides) {
    if (o.rol === 'dueno' || !(o.rol in m)) continue;
    const fila = m[o.rol as Rol];
    if (o.modulo in fila) fila[o.modulo as Modulo] = Math.max(0, Math.min(3, o.nivel)) as Nivel;
  }
  return m;
}

// ---------- Schemas de entrada ----------

export const TIPOS_MP = ['carton', 'tinta', 'aglutinante', 'otro'] as const;

export type TipoMp = (typeof TIPOS_MP)[number];

export const LABEL_TIPO_MP: Record<TipoMp, string> = { carton: 'Cartón', tinta: 'Tinta', aglutinante: 'Aglutinante', otro: 'Otro' };

export const TURNOS = ['manana', 'tarde'] as const;

export type Turno = (typeof TURNOS)[number];

export const LABEL_TURNO: Record<Turno, string> = { manana: 'Mañana', tarde: 'Tarde' };

export const LABEL_TAMANO = { chico: 'Chico', grande: 'Grande' } as const;

export const VEHICULOS = ['camioneta', 'chasis', 'acoplado', 'camion_termico'] as const;

export type Vehiculo = (typeof VEHICULOS)[number];

export const LABEL_VEHICULO: Record<Vehiculo, string> = { camioneta: 'Camioneta', chasis: 'Chasis', acoplado: 'Acoplado', camion_termico: 'Camión térmico' };

/** Armado más común: 2 de ancho × 3 de largo × 6 de alto (paquetes de 60). */
export const PALET_DEFAULT = { ancho: 2, largo: 3, alto: 6 } as const;

/** Consumo según receta: cantidad por hora × minutos trabajados. */
export const consumoTeorico = (cantidadPorHora: number, minutos: number) => Math.round((cantidadPorHora * minutos) / 60);

/** Paquetes que tendría que haber hecho la máquina en ese tiempo (null si la variante no tiene maples/hora). */
export function paquetesTeoricos(maplesPorHora: number, minutos: number, maplesPorPaquete: number): number | null {
  if (maplesPorHora <= 0) return null;
  return Math.floor((maplesPorHora * minutos) / 60 / maplesPorPaquete);
}

/** "7,5" | "7:30" → 450 minutos. */
export function aMinutos(v: string): number | null {
  const s = v.trim();
  const hm = /^(\d{1,2}):([0-5]\d)$/.exec(s);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]);
  const n = escalar(s, 60);
  return n === null ? null : n;
}

export const formatMinutos = (m: number) => `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;

/** Color del cartón sin teñir: el maple "natural" se pinta así en 3D. */
export const COLOR_CARTON = '#bfae90';

// ---------- Ventas y cuentas ----------

export const MEDIOS = ['efectivo', 'transferencia', 'mercado_pago', 'echeq', 'cheque'] as const;

export type Medio = (typeof MEDIOS)[number];

export const LABEL_MEDIO: Record<Medio | 'endoso', string> = { efectivo: 'Efectivo', transferencia: 'Transferencia', mercado_pago: 'Mercado Pago', echeq: 'e-Cheq', cheque: 'Cheque físico', endoso: 'Cheque de terceros' };

/** Venta: cada palet a su precio por maple. Mismo redondeo que las compras. */
export function calcularVenta(items: { maples: number; precioMaple: number }[], ivaBp: number) {
  const neto = items.reduce((a, i) => a + i.maples * i.precioMaple, 0);
  const iva = Math.round((neto * ivaBp) / 10000);
  return { neto, iva, total: neto + iva };
}

export const MEDIOS_GASTO = ['caja_chica', ...MEDIOS] as const;

export type MedioGasto = (typeof MEDIOS_GASTO)[number];

export const LABEL_MEDIO_GASTO: Record<MedioGasto, string> = { caja_chica: 'Caja chica', ...LABEL_MEDIO };

const diasEntre = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000);

export type EstadoRecompra = 'le_toca' | 'dejo' | 'al_dia';

/**
 * Ritmo de compra de un cliente a partir de los días en que compró. Cada cliente tiene su propio ritmo:
 * - "le toca": ya pasó (casi) su intervalo habitual, todavía no el doble.
 * - "dejó de comprar": pasó el doble de su intervalo (o 45 días si compró una sola vez).
 */
export function ritmoCliente(fechas: string[], hoy: string): { compras: number; cadaDias: number | null; diasDesdeUltima: number; estado: EstadoRecompra } {
  const dias = [...new Set(fechas)].sort();
  const ultima = dias.at(-1)!;
  const desde = diasEntre(ultima, hoy);
  if (dias.length < 2) return { compras: dias.length, cadaDias: null, diasDesdeUltima: desde, estado: desde >= 45 ? 'dejo' : 'al_dia' };
  const cadaDias = Math.max(1, Math.round(diasEntre(dias[0]!, ultima) / (dias.length - 1)));
  const estado = desde >= Math.max(cadaDias * 2, 21) ? 'dejo' : desde >= Math.round(cadaDias * 0.9) ? 'le_toca' : 'al_dia';
  return { compras: dias.length, cadaDias, diasDesdeUltima: desde, estado };
}

/** Teléfono argentino → número para wa.me (549 + área + número, sin 0 ni 15). null si no parece válido. */
export function telefonoWhatsapp(tel: string | null): string | null {
  if (!tel) return null;
  let d = tel.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('54')) d = d.slice(2);
  if (d.startsWith('9')) d = d.slice(1);
  if (d.startsWith('0')) d = d.slice(1);
  d = d.replace(/^(\d{2,4})15(\d{6,8})$/, '$1$2'); // 351 15 xxxxxxx → 351 xxxxxxx
  return d.length === 10 ? `549${d}` : null;
}

// ---------- Niveles de urgencia (los mismos colores en toda la app) ----------

/** critico = hay que actuar ya (rojo) · atencion = pronto (ámbar) · ok = bien (verde). */
export type Nivel3 = 'critico' | 'atencion' | 'ok';
export const ORDEN_NIVEL: Record<Nivel3, number> = { critico: 0, atencion: 1, ok: 2 };

/**
 * Estado del stock de una materia prima, en palabras. Nunca muestra un número negativo: si se usó más de lo
 * cargado, es que falta cargar una compra (o el stock está mal) y eso es lo que se dice.
 */
export function estadoStock(m: { stock: number; unidad: Unidad; stockMinimo: number; dias: number | null; diasAviso: number }): { nivel: Nivel3; titulo: string; detalle: string; stockVisible: number } {
  const visible = Math.max(0, m.stock);
  if (m.stock < 0) return { nivel: 'critico', titulo: 'Sin stock cargado', stockVisible: 0,
    detalle: `Se usaron ${formatCantidad(-m.stock, m.unidad)} más de lo que había cargado. Falta cargar una compra o corregir el stock.` };
  if (m.stock === 0) return { nivel: 'critico', titulo: 'Agotado', stockVisible: 0, detalle: 'No queda nada.' };
  const alcanza = m.dias === null ? null : m.dias < 1 ? 'menos de un día' : m.dias === 1 ? '1 día' : `${m.dias} días`;
  if (m.dias !== null && m.dias <= 2) return { nivel: 'critico', titulo: 'Se acaba ya', stockVisible: visible, detalle: `Alcanza para ${alcanza} al ritmo de los últimos 30 días.` };
  const bajoMinimo = m.stockMinimo > 0 && m.stock < m.stockMinimo;
  if (bajoMinimo || (m.dias !== null && m.dias <= m.diasAviso)) return { nivel: 'atencion', titulo: 'Queda poco', stockVisible: visible,
    detalle: alcanza ? `Alcanza para ${alcanza}.` : `Debajo del mínimo (${formatCantidad(m.stockMinimo, m.unidad)}).` };
  return { nivel: 'ok', titulo: 'Hay stock', stockVisible: visible, detalle: alcanza ? `Alcanza para ${alcanza}.` : 'Sin consumo en los últimos 30 días.' };
}

/** "1 día" / "3 días": para no escribir nunca "1 días". */
export const plural = (n: number, uno: string, varios: string) => `${n.toLocaleString('es-AR')} ${n === 1 ? uno : varios}`;

// ---------------------------------------------------------------- Agenda
export const REPETICIONES = ['no', 'diario', 'semanal', 'mensual'] as const;
export type Repeticion = (typeof REPETICIONES)[number];
export const LABEL_REPETIR: Record<Repeticion, string> = { no: 'Una sola vez', diario: 'Todos los días', semanal: 'Cada semana', mensual: 'Cada mes' };

const sumarDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * Fechas en que cae un recordatorio entre `desde` y `hasta` (inclusive, 'AAAA-MM-DD'). Mensual: mismo día del mes;
 * si el mes no lo tiene (31 en abril), cae el último día de ese mes.
 */
export function ocurrencias(r: { fecha: string; repetir: Repeticion }, desde: string, hasta: string): string[] {
  if (r.repetir === 'no') return r.fecha >= desde && r.fecha <= hasta ? [r.fecha] : [];
  const fuera: string[] = [];
  if (r.repetir === 'mensual') {
    const dia = Number(r.fecha.slice(8, 10));
    let [a, m] = [Number(r.fecha.slice(0, 4)), Number(r.fecha.slice(5, 7))];
    for (let k = 0; k < 400; k++) {
      const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
      const f = `${a}-${String(m).padStart(2, '0')}-${String(Math.min(dia, ultimo)).padStart(2, '0')}`;
      if (f > hasta) break;
      if (f >= desde) fuera.push(f);
      if (++m > 12) { m = 1; a++; }
    }
    return fuera;
  }
  const paso = r.repetir === 'diario' ? 1 : 7;
  // Salta directo cerca de `desde` en vez de recorrer desde la primera fecha.
  let f = r.fecha;
  if (desde > f) {
    const dias = Math.round((Date.parse(desde) - Date.parse(f)) / 86_400_000);
    f = sumarDias(f, Math.floor(dias / paso) * paso);
    if (f < desde) f = sumarDias(f, paso);
  }
  for (; f <= hasta && fuera.length < 400; f = sumarDias(f, paso)) fuera.push(f);
  return fuera;
}
