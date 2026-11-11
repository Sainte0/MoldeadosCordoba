import { ChartColumn, ClipboardList, Coins, Factory, Home, Layers, Receipt, Scale, ScanLine, Settings, ShoppingCart, Wallet } from 'lucide-react';
import type { Modulo } from '@moldeados/shared/base';

// Mapa de la app: áreas del menú, sus pestañas y las tareas frecuentes. Lo usan el menú, el inicio y el buscador.

// Pocas áreas, siempre las mismas: lo de adentro va en pestañas. Una función nueva entra en un área existente,
// nunca como un ítem nuevo del menú (pedido del cliente: ultra simple).
export interface Pestana { a: string; texto: string; modulo: Modulo }
export interface Area { texto: string; icono: typeof Home; pestanas: Pestana[]; /** rutas que también pertenecen al área */ tambien?: string[] }
export const AREAS: Area[] = [
  { texto: 'Planta', icono: Factory, pestanas: [
    { a: '/produccion', texto: 'Producción', modulo: 'produccion' },
    { a: '/palets', texto: 'Stock y palets', modulo: 'produccion' },
    { a: '/materia-prima', texto: 'Materia prima', modulo: 'materias' },
  ] },
  { texto: 'Ventas', icono: Receipt, pestanas: [
    { a: '/ventas', texto: 'Ventas', modulo: 'ventas' },
    { a: '/pedidos', texto: 'Pedidos', modulo: 'ventas' },
    { a: '/clientes', texto: 'Clientes', modulo: 'ventas' },
  ] },
  { texto: 'Compras', icono: ShoppingCart, tambien: ['/pesaje'], pestanas: [
    { a: '/compras', texto: 'Compras y pesajes', modulo: 'compras' },
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
export const TAREAS: { a: string; titulo: string; detalle: string; icono: typeof Factory; modulo: Modulo }[] = [
  { a: '/ventas/nueva', titulo: 'Despachar palets', detalle: 'Se va un camión: escaneá y listo', icono: ScanLine, modulo: 'ventas' },
  { a: '/produccion/nuevo', titulo: 'Parte de producción', detalle: 'Terminó un turno de máquina', icono: Factory, modulo: 'produccion' },
  { a: '/palets/nuevo', titulo: 'Armar palet', detalle: 'Con su etiqueta y QR', icono: Layers, modulo: 'produccion' },
  { a: '/pesaje', titulo: 'Pesaje de cartón', detalle: 'Llegó un camión a la báscula', icono: Scale, modulo: 'compras' },
  { a: '/dinero/nuevo?tipo=cobro', titulo: 'Pago a cuenta', detalle: 'Un cliente paga: efectivo, transferencia o cheque', icono: Wallet, modulo: 'cuentas' },
  { a: '/egresos/nuevo', titulo: 'Cargar egreso', detalle: 'Pagado o pendiente, con foto del comprobante', icono: Coins, modulo: 'gastos' },
  { a: '/pedidos/nuevo', titulo: 'Nuevo pedido', detalle: 'Un cliente encarga maples', icono: ClipboardList, modulo: 'ventas' },
  { a: '/compras/nueva', titulo: 'Compra de insumos', detalle: 'Tinta, aglutinante u otros', icono: ShoppingCart, modulo: 'compras' },
];

