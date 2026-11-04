import { z } from 'zod';

// Única fuente de verdad del dominio para backend y app: schemas de entrada, permisos y cálculos.
// Plata en CENTAVOS y cantidades en MILÉSIMAS de su unidad (gramos para kg, mililitros para litros),
// siempre enteros: nadie multiplica por 100 ni por 1000 a mano, usa estos helpers.

// ---------- Plata y cantidades ----------

/** "1.234,56" | "1234.56" | 1234.56 → enteros escalados. null si no es un número válido. */
function escalar(valor: string | number, factor: number): number | null {
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

const texto = (max = 200) => z.string().trim().max(max);
const opcional = (max = 200) => texto(max).optional().transform((v) => (v ? v : null));
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha no es válida');

export const loginSchema = z.object({
  usuario: texto(60).min(1, 'Ingresá tu usuario').transform((v) => v.toLowerCase()),
  password: z.string().min(1, 'Ingresá tu contraseña').max(200),
});

export const usuarioSchema = z.object({
  nombre: texto(120).min(2, 'Ingresá el nombre'),
  usuario: texto(60).min(3, 'El usuario debe tener al menos 3 letras').regex(/^[a-z0-9._-]+$/i, 'El usuario solo puede tener letras, números, punto o guion').transform((v) => v.toLowerCase()),
  rol: z.enum(ROLES),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres').max(200).optional(),
  activo: z.boolean().default(true),
});

export const permisoSchema = z.object({
  rol: z.enum(ROLES).refine((r) => r !== 'dueno', 'El dueño ve todo siempre'),
  modulo: z.enum(MODULOS.map((m) => m.id) as [Modulo, ...Modulo[]]),
  nivel: z.number().int().min(0).max(3),
});

export const TIPOS_MP = ['carton', 'tinta', 'aglutinante', 'otro'] as const;
export type TipoMp = (typeof TIPOS_MP)[number];
export const LABEL_TIPO_MP: Record<TipoMp, string> = { carton: 'Cartón', tinta: 'Tinta', aglutinante: 'Aglutinante', otro: 'Otro' };

export const proveedorSchema = z.object({
  nombre: texto(120).min(2, 'Ingresá el nombre del proveedor'),
  cuit: opcional(20).refine((v) => v === null || /^\d{2}-?\d{8}-?\d$/.test(v), 'El CUIT no es válido (11 números)'),
  telefono: opcional(40),
  email: opcional(120).refine((v) => v === null || /^\S+@\S+\.\S+$/.test(v), 'El email no es válido'),
  direccion: opcional(200),
  tipos: z.array(z.enum(TIPOS_MP)).default([]),
  notas: opcional(1000),
});

export const materiaPrimaSchema = z.object({
  nombre: texto(80).min(2, 'Ingresá el nombre'),
  tipo: z.enum(TIPOS_MP),
  unidad: z.enum(['kg', 'l']),
  color: opcional(40),
  stockMinimo: z.number().int().min(0).default(0),
  diasAviso: z.number().int().min(0).max(120).default(7),
  activo: z.boolean().default(true),
});

export const ajusteStockSchema = z.object({
  cantidad: z.number().int().refine((v) => v !== 0, 'La corrección no puede ser cero'),
  nota: texto(300).min(3, 'Contá por qué se corrige el stock'),
});

const facturaFields = {
  proveedorId: z.string().uuid('Elegí un proveedor'),
  fecha,
  conFactura: z.boolean(),
  nroFactura: opcional(40),
  ivaBp: z.number().int().refine((v) => (ALICUOTAS_IVA as readonly number[]).includes(v), 'Alícuota de IVA no válida'),
  notas: opcional(1000),
};

/** Ticket de pesaje: ingreso de cartón. El neto lo calcula el servidor (bruto − tara). */
export const pesajeSchema = z
  .object({
    ...facturaFields,
    materiaPrimaId: z.string().uuid('Elegí el tipo de cartón'),
    brutoG: z.number().int().positive('Ingresá el peso bruto'),
    taraG: z.number().int().min(0),
    precioPorKg: z.number().int().min(0, 'El precio no puede ser negativo'),
    patente: opcional(15).transform((v) => (v ? v.toUpperCase().replace(/\s/g, '') : null)),
  })
  .refine((v) => v.brutoG > v.taraG, { message: 'El bruto tiene que ser mayor que la tara', path: ['taraG'] });

export const compraSchema = z.object({
  ...facturaFields,
  items: z
    .array(
      z.object({
        materiaPrimaId: z.string().uuid(),
        cantidad: z.number().int().positive('La cantidad tiene que ser mayor a cero'),
        precioUnitario: z.number().int().min(0),
      }),
    )
    .min(1, 'Agregá al menos un producto'),
});

export const anularSchema = z.object({ motivo: texto(300).min(3, 'Contá por qué se anula') });

// ---------- Producción ----------

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

const uuid = (msg: string) => z.string().uuid(msg);

export const maquinaSchema = z.object({
  codigo: texto(20).min(1, 'Ingresá el código, ej.: MP-1'),
  nombre: texto(80).min(2, 'Ingresá el nombre'),
  activo: z.boolean().default(true),
});

export const varianteSchema = z.object({
  codigo: texto(20).min(2, 'Ingresá el código, ej.: MGR-ROJ').regex(/^[A-Za-z0-9-]+$/, 'El código solo puede tener letras, números y guiones').transform((v) => v.toUpperCase()),
  nombre: texto(80).min(2, 'Ingresá el nombre'),
  tamano: z.enum(['chico', 'grande']),
  color: opcional(40),
  colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'El color no es válido').transform((v) => v.toLowerCase()).nullable().default(null),
  maquinaId: uuid('Elegí la máquina'),
  maplesPorPaquete: z.number().int().positive().default(60),
  maplesPorHora: z.number().int().min(0).default(0),
  activo: z.boolean().default(true),
  receta: z
    .array(z.object({ materiaPrimaId: z.string().uuid(), cantidadPorHora: z.number().int().positive('La cantidad por hora tiene que ser mayor a cero') }))
    .default([])
    .refine((r) => new Set(r.map((i) => i.materiaPrimaId)).size === r.length, 'Hay una materia prima repetida en la receta'),
});

export const empleadoSchema = z.object({
  nombre: texto(120).min(2, 'Ingresá el nombre'),
  turnoHabitual: z.enum(TURNOS).nullable().default(null),
  activo: z.boolean().default(true),
});

export const parteSchema = z.object({
  fecha,
  turno: z.enum(TURNOS),
  maquinaId: uuid('Elegí la máquina'),
  varianteId: uuid('Elegí qué maple se hizo'),
  empleadoIds: z.array(z.string().uuid()).min(1, 'Marcá quiénes trabajaron'),
  minutos: z.number().int().min(1, 'Ingresá cuánto tiempo trabajó la máquina').max(1440, 'Un turno no puede durar más de 24 horas'),
  pulpeadas: z.number().int().min(0).default(0),
  paquetes: z.number().int().min(0, 'Los paquetes no pueden ser negativos'),
  /** Solo lo que se corrigió respecto de la receta. Lo que no viene, se toma el teórico. */
  consumoReal: z.array(z.object({ materiaPrimaId: z.string().uuid(), cantidad: z.number().int().min(0) })).default([]),
  notas: opcional(1000),
});

export const paletSchema = z.object({
  varianteId: uuid('Elegí qué maple va en el palet'),
  ancho: z.number().int().min(1).max(10),
  largo: z.number().int().min(1).max(10),
  alto: z.number().int().min(1).max(20),
  vehiculo: z.enum(VEHICULOS).nullable().default(null),
  destino: opcional(120),
  notas: opcional(1000),
});

export const empresaSchema = z.object({
  razonSocial: texto(120).min(2, 'Ingresá la razón social'),
  direccion: opcional(200),
  telefono: opcional(40),
  email: opcional(120),
  cuit: opcional(20),
});

/** Color del cartón sin teñir: el maple "natural" se pinta así en 3D. */
export const COLOR_CARTON = '#bfae90';

// ---------- Ventas y cuentas ----------

export const MEDIOS = ['efectivo', 'transferencia', 'mercado_pago', 'echeq', 'cheque'] as const;
export type Medio = (typeof MEDIOS)[number];
export const LABEL_MEDIO: Record<Medio, string> = { efectivo: 'Efectivo', transferencia: 'Transferencia', mercado_pago: 'Mercado Pago', echeq: 'e-Cheq', cheque: 'Cheque físico' };

/** Venta: cada palet a su precio por maple. Mismo redondeo que las compras. */
export function calcularVenta(items: { maples: number; precioMaple: number }[], ivaBp: number) {
  const neto = items.reduce((a, i) => a + i.maples * i.precioMaple, 0);
  const iva = Math.round((neto * ivaBp) / 10000);
  return { neto, iva, total: neto + iva };
}

export const clienteSchema = z.object({
  nombre: texto(120).min(2, 'Ingresá el nombre del cliente'),
  cuit: opcional(20).refine((v) => v === null || /^\d{2}-?\d{8}-?\d$/.test(v), 'El CUIT no es válido (11 números)'),
  telefono: opcional(40),
  email: opcional(120).refine((v) => v === null || /^\S+@\S+\.\S+$/.test(v), 'El email no es válido'),
  direccion: opcional(200),
  vehiculoHabitual: z.enum(VEHICULOS).nullable().default(null),
  notas: opcional(1000),
});

export const precioSchema = z.object({
  varianteId: z.string().uuid(),
  /** Sin cliente = precio de lista. */
  clienteId: z.string().uuid().nullable().default(null),
  /** null = sacar el precio especial y volver a la lista. */
  precioMaple: z.number().int().min(0, 'El precio no puede ser negativo').nullable(),
});

export const ventaSchema = z.object({
  clienteId: uuid('Elegí el cliente'),
  fecha,
  conFactura: z.boolean(),
  nroFactura: opcional(40),
  ivaBp: z.number().int().refine((v) => (ALICUOTAS_IVA as readonly number[]).includes(v), 'Alícuota de IVA no válida'),
  vehiculo: z.enum(VEHICULOS).nullable().default(null),
  patente: opcional(15).transform((v) => (v ? v.toUpperCase().replace(/\s/g, '') : null)),
  retira: texto(120).min(2, 'Anotá quién se lleva los palets'),
  notas: opcional(1000),
  palets: z.array(z.string().uuid()).min(1, 'Elegí al menos un palet'),
  /** Precio por maple de cada código. Lo que no viene, se toma el del cliente o el de lista. */
  precios: z.array(z.object({ varianteId: z.string().uuid(), precioMaple: z.number().int().min(0) })).default([]),
});

export const movimientoDineroSchema = z
  .object({
    tipo: z.enum(['cobro', 'pago']),
    clienteId: z.string().uuid().nullable().default(null),
    proveedorId: z.string().uuid().nullable().default(null),
    fecha,
    monto: z.number().int().positive('Ingresá el monto'),
    medio: z.enum(MEDIOS),
    bancoId: z.string().uuid().nullable().default(null),
    chequeNumero: opcional(30),
    chequeFechaCobro: fecha.nullable().default(null),
    referencia: opcional(80),
    notas: opcional(1000),
  })
  .superRefine((v, ctx) => {
    if (v.tipo === 'cobro' && !v.clienteId) ctx.addIssue({ code: 'custom', path: ['clienteId'], message: 'Elegí el cliente' });
    if (v.tipo === 'pago' && !v.proveedorId) ctx.addIssue({ code: 'custom', path: ['proveedorId'], message: 'Elegí el proveedor' });
    if ((v.medio === 'echeq' || v.medio === 'cheque') && !v.bancoId) ctx.addIssue({ code: 'custom', path: ['bancoId'], message: 'Elegí el banco del cheque' });
    if (v.medio === 'cheque' && (!v.chequeNumero || !v.chequeFechaCobro)) ctx.addIssue({ code: 'custom', path: ['chequeNumero'], message: 'Ingresá el número y la fecha de cobro del cheque' });
  });

export const bancoSchema = z.object({ nombre: texto(80).min(2, 'Ingresá el nombre del banco'), activo: z.boolean().default(true) });

export const MEDIOS_GASTO = ['caja_chica', ...MEDIOS] as const;
export type MedioGasto = (typeof MEDIOS_GASTO)[number];
export const LABEL_MEDIO_GASTO: Record<MedioGasto, string> = { caja_chica: 'Caja chica', ...LABEL_MEDIO };

export const gastoSchema = z.object({
  fecha,
  categoriaId: uuid('Elegí de qué es el gasto'),
  descripcion: texto(200).min(2, 'Contá en pocas palabras qué se pagó'),
  monto: z.number().int().positive('Ingresá el monto'),
  medio: z.enum(MEDIOS_GASTO),
  bancoId: z.string().uuid().nullable().default(null),
  conFactura: z.boolean().default(false),
  nroFactura: opcional(40),
  empleadoId: z.string().uuid().nullable().default(null),
  comprobanteId: z.string().uuid().nullable().default(null),
  notas: opcional(1000),
});

export const cajaSchema = z.object({
  fecha,
  motivo: z.enum(['reposicion', 'arqueo']),
  /** Reposición: siempre positivo. Arqueo: la diferencia contada (+ sobra, − falta). */
  monto: z.number().int().refine((v) => v !== 0, 'Ingresá el monto'),
  concepto: texto(200).min(2, 'Anotá un concepto'),
}).refine((v) => v.motivo !== 'reposicion' || v.monto > 0, { message: 'La reposición tiene que ser un monto positivo', path: ['monto'] });

export const categoriaGastoSchema = z.object({ nombre: texto(80).min(2, 'Ingresá el nombre'), activo: z.boolean().default(true) });

export const instructivoSchema = z.object({
  clave: texto(200).min(3),
  /** null = volver al texto original */
  texto: texto(1000).min(3, 'El instructivo no puede quedar vacío').nullable(),
});

// ---------- Avisos ----------

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

export const procedimientoSchema = z.object({
  titulo: texto(150).min(3, 'Ingresá el título'),
  resumen: opcional(400),
  pasos: texto(20000).min(3, 'Escribí al menos un paso'),
});

export type GastoInput = z.infer<typeof gastoSchema>;
export type VentaInput = z.infer<typeof ventaSchema>;
export type MovimientoDineroInput = z.infer<typeof movimientoDineroSchema>;

export type ParteInput = z.infer<typeof parteSchema>;
export type PaletInput = z.infer<typeof paletSchema>;
export type VarianteInput = z.infer<typeof varianteSchema>;
export type PesajeInput = z.infer<typeof pesajeSchema>;
export type CompraInput = z.infer<typeof compraSchema>;
export type ProveedorInput = z.infer<typeof proveedorSchema>;
export type MateriaPrimaInput = z.infer<typeof materiaPrimaSchema>;
export type UsuarioInput = z.infer<typeof usuarioSchema>;
