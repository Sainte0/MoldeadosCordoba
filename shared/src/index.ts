import { z } from 'zod';
import { ALICUOTAS_IVA, MEDIOS, MEDIOS_GASTO, MODULOS, ROLES, TIPOS_MP, TURNOS, VEHICULOS, type Modulo } from './base.js';

// Schemas de entrada (Zod) para el backend. Todo lo demás está en base.ts y se re-exporta acá.
export * from './base.js';

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
