import { ChartColumn, Coins, Factory, Home, Layers, Receipt, Scale, ScanLine, Settings, ShoppingCart, Wallet } from 'lucide-react';
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
    { a: '/ventas', texto: 'Despachos', modulo: 'ventas' },
    { a: '/clientes', texto: 'Clientes', modulo: 'ventas' },
    { a: '/precios', texto: 'Precios', modulo: 'ventas' },
  ] },
  { texto: 'Compras', icono: ShoppingCart, tambien: ['/pesaje'], pestanas: [
    { a: '/compras', texto: 'Compras y pesajes', modulo: 'compras' },
    { a: '/proveedores', texto: 'Proveedores', modulo: 'proveedores' },
  ] },
  { texto: 'Plata', icono: Wallet, tambien: ['/dinero'], pestanas: [
    { a: '/cuentas', texto: 'Cuentas corrientes', modulo: 'cuentas' },
    { a: '/gastos', texto: 'Gastos', modulo: 'gastos' },
    { a: '/caja', texto: 'Caja chica', modulo: 'gastos' },
  ] },
  { texto: 'Tablero', icono: ChartColumn, pestanas: [{ a: '/tablero', texto: 'Tablero', modulo: 'tablero' }] },
];
export const AJUSTES: Area = { texto: 'Ajustes', icono: Settings, pestanas: [
  { a: '/maples', texto: 'Maples y recetas', modulo: 'productos' },
  { a: '/equipo', texto: 'Equipo y permisos', modulo: 'usuarios' },
  { a: '/registro', texto: 'Registro de cambios', modulo: 'auditoria' },
  { a: '/exportar', texto: 'Exportar datos', modulo: 'tablero' },
] };
export const enArea = (area: Area, path: string) => [...area.pestanas.map((x) => x.a), ...(area.tambien ?? [])].some((r) => path === r || path.startsWith(r + '/'));

// Las 4 primeras que el rol puede hacer, en orden de frecuencia en planta. El resto está en su área del menú.
export const TAREAS: { a: string; titulo: string; detalle: string; icono: typeof Factory; modulo: Modulo }[] = [
  { a: '/ventas/nueva', titulo: 'Despachar palets', detalle: 'Se va un camión: escaneá y listo', icono: ScanLine, modulo: 'ventas' },
  { a: '/produccion/nuevo', titulo: 'Parte de producción', detalle: 'Terminó un turno de máquina', icono: Factory, modulo: 'produccion' },
  { a: '/palets/nuevo', titulo: 'Armar palet', detalle: 'Con su etiqueta y QR', icono: Layers, modulo: 'produccion' },
  { a: '/pesaje', titulo: 'Pesaje de cartón', detalle: 'Llegó un camión a la báscula', icono: Scale, modulo: 'compras' },
  { a: '/dinero/nuevo?tipo=cobro', titulo: 'Registrar cobro', detalle: 'Efectivo, transferencia o cheque', icono: Wallet, modulo: 'cuentas' },
  { a: '/gastos/nuevo', titulo: 'Cargar gasto', detalle: 'Con foto del ticket', icono: Coins, modulo: 'gastos' },
  { a: '/compras/nueva', titulo: 'Compra de insumos', detalle: 'Tinta, aglutinante u otros', icono: ShoppingCart, modulo: 'compras' },
];

