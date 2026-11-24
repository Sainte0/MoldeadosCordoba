import { ChartColumn, ClipboardList, Coins, Factory, Home, Layers, Receipt, Scale, ScanLine, Settings, ShoppingCart, Truck, Wallet } from 'lucide-react';
import type { Modulo } from '@moldeados/shared/base';

// Mapa de la app: áreas del menú, sus pestañas y las tareas frecuentes. Lo usan el menú, el inicio y el buscador.

// Pocas áreas, siempre las mismas: lo de adentro va en pestañas. Una función nueva entra en un área existente,
// nunca como un ítem nuevo del menú (pedido del cliente: ultra simple).
export interface Pestana { a: string; texto: string; modulo: Modulo }
export interface Area { texto: string; icono: typeof Home; pestanas: Pestana[]; /** rutas que también pertenecen al área */ tambien?: string[] }
export const AREAS: Area[] = [
  // La producción por turno queda escondida (pedido 01: más adelante para costos); sus rutas siguen andando.
  { texto: 'Planta', icono: Factory, tambien: ['/escanear', '/produccion'], pestanas: [
    { a: '/palets', texto: 'Stock de pallets', modulo: 'produccion' },
    { a: '/plastificar', texto: 'Plastificadora', modulo: 'produccion' },
    { a: '/materia-prima', texto: 'Materia prima', modulo: 'materias' },
  ] },
  { texto: 'Ventas', icono: Receipt, pestanas: [
    { a: '/ordenes', texto: 'Órdenes', modulo: 'ventas' },
    { a: '/ventas', texto: 'Ventas', modulo: 'ventas' },
    { a: '/pedidos', texto: 'Pedidos', modulo: 'ventas' },
    { a: '/clientes', texto: 'Clientes', modulo: 'ventas' },
    { a: '/choferes', texto: 'Choferes', modulo: 'ventas' },
  ] },
  { texto: 'Compras', icono: ShoppingCart, tambien: ['/pesaje'], pestanas: [
    { a: '/compras', texto: 'Compras y cartón', modulo: 'compras' },
    { a: '/proveedores', texto: 'Proveedores', modulo: 'proveedores' },
  ] },
  { texto: 'Plata', icono: Wallet, tambien: ['/dinero'], pestanas: [
    { a: '/cuentas', texto: 'Saldos', modulo: 'cuentas' },
    { a: '/egresos', texto: 'Egresos', modulo: 'gastos' },
    { a: '/caja', texto: 'Caja chica', modulo: 'gastos' },
  ] },
  { texto: 'Tablero', icono: ChartColumn, pestanas: [{ a: '/tablero', texto: 'Tablero', modulo: 'tablero' }] },
];
export const AJUSTES: Area = { texto: 'Ajustes', icono: Settings, pestanas: [
  { a: '/maples', texto: 'Maples y máquinas', modulo: 'productos' },
  // El precio es del producto: va al lado de los maples (el precio especial de un cliente sigue en su ficha).
  { a: '/precios', texto: 'Precios', modulo: 'ventas' },
  { a: '/equipo', texto: 'Equipo y permisos', modulo: 'usuarios' },
  { a: '/registro', texto: 'Registro de cambios', modulo: 'auditoria' },
  { a: '/importar', texto: 'Importar planillas', modulo: 'tablero' },
  { a: '/exportar', texto: 'Exportar datos', modulo: 'tablero' },
] };
export const enArea = (area: Area, path: string) => [...area.pestanas.map((x) => x.a), ...(area.tambien ?? [])].some((r) => path === r || path.startsWith(r + '/'));

// Las 4 primeras que el rol puede hacer, en orden de frecuencia en planta. El resto está en su área del menú.
export const TAREAS: { a: string; titulo: string; corto: string; detalle: string; icono: typeof Factory; modulo: Modulo; nivel?: 2 | 3 }[] = [
  { a: '/plastificar', titulo: 'Pallet terminado', corto: 'Pallet', detalle: 'Salió de la plastificadora: entra al stock con su etiqueta', icono: Layers, modulo: 'produccion' },
  { a: '/ordenes/nueva', titulo: 'Orden de venta', corto: 'Orden', detalle: 'Cliente, chofer y qué se lleva', icono: Truck, modulo: 'ventas', nivel: 3 },
  { a: '/ordenes', titulo: 'Cargar camión', corto: 'Carga', detalle: 'Escanear los pallets de una orden', icono: ScanLine, modulo: 'produccion' },
  { a: '/pesaje', titulo: 'Entrada de cartón', corto: 'Cartón', detalle: 'Llegó un camión a la báscula', icono: Scale, modulo: 'compras' },
  { a: '/dinero/nuevo?tipo=cobro', titulo: 'Pago a cuenta', corto: 'Cobro', detalle: 'Un cliente paga: efectivo, transferencia o cheque', icono: Wallet, modulo: 'cuentas' },
  { a: '/egresos/nuevo', titulo: 'Cargar egreso', corto: 'Egreso', detalle: 'Pagado o pendiente, con foto del comprobante', icono: Coins, modulo: 'gastos' },
  { a: '/pedidos/nuevo', titulo: 'Nuevo pedido', corto: 'Pedido', detalle: 'Un cliente encarga maples', icono: ClipboardList, modulo: 'ventas' },
  { a: '/compras/nueva', titulo: 'Compra de insumos', corto: 'Compra', detalle: 'Tinta, aglutinante u otros', icono: ShoppingCart, modulo: 'compras' },
];


// ---------- Volver a donde estaba ----------
// Cada entrada del historial del navegador tiene un índice (history.state.idx, de react-router). Se guarda qué
// pantalla hubo en cada índice para que "Volver" sepa adónde va y lo diga ("← Cuenta", "← Inicio").
const CLAVE_HIST = 'moldeados:historial';
const leerHist = (): Record<string, string> => { try { return JSON.parse(sessionStorage.getItem(CLAVE_HIST) ?? '{}') as Record<string, string>; } catch { return {}; } };
const indice = (): number => (window.history.state as { idx?: number } | null)?.idx ?? 0;
export function registrarRuta(ruta: string): void {
  try { sessionStorage.setItem(CLAVE_HIST, JSON.stringify({ ...leerHist(), [indice()]: ruta })); } catch { /* sin almacenamiento: Volver usa la sección */ }
}
/** La pantalla anterior dentro de la app, o null si se entró directo (QR, link) o venía de una carga ya terminada. */
export function rutaAnterior(): string | null {
  const i = indice();
  if (i <= 0) return null;
  const r = leerHist()[i - 1];
  return r && !/\/(nuevo|nueva)(\?|$)|^\/pesaje|^\/dinero\/nuevo/.test(r) ? r : null;
}
const DETALLES: [RegExp, string][] = [
  [/^\/ventas\/[^/]+/, 'Venta'], [/^\/compras\/[^/]+/, 'Compra'], [/^\/palets\/[^/]+/, 'Palet'], [/^\/produccion\/[^/]+/, 'Parte'],
  [/^\/pedidos\/[^/]+/, 'Pedido'], [/^\/ordenes\/[^/]+/, 'Orden'], [/^\/cuentas\/[^/]+/, 'Cuenta'], [/^\/agenda/, 'Agenda'], [/^\/ayuda/, 'Ayuda'], [/^\/escanear/, 'Escanear'],
];
/** Nombre corto de una pantalla, para el botón Volver. */
export function nombreDeRuta(ruta: string): string {
  const path = ruta.split('?')[0]!;
  if (path === '/') return 'Hoy';
  const pestana = [...AREAS, AJUSTES].flatMap((a) => a.pestanas).find((p) => p.a === path);
  if (pestana) return pestana.texto;
  return DETALLES.find(([re]) => re.test(path))?.[1] ?? 'Volver';
}

/** Si el rol puede hacer la tarea (algunas piden más que cargar: la orden de venta es del gerente). */
export const puedeTarea = (puede: (m: Modulo, n?: 1 | 2 | 3) => boolean, t: (typeof TAREAS)[number]) => puede(t.modulo, t.nivel ?? 2);
