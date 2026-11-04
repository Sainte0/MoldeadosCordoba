import { useQuery } from '@tanstack/react-query';
import type { TipoMp, Unidad } from '@moldeados/shared';
import { api } from './api';

// Tipos de lo que devuelve la API y las consultas que usan varias pantallas.

export interface MateriaPrima { id: string; nombre: string; tipo: TipoMp; unidad: Unidad; color: string | null; stockMinimo: number; activo: boolean; stock: number }
export interface Proveedor {
  id: string; nombre: string; cuit: string | null; telefono: string | null; email: string | null; direccion: string | null;
  tipos: TipoMp[]; notas: string | null; ultimaCompra?: string | null; comprado30d?: number;
}
export interface CompraFila {
  id: string; numero: number; tipo: 'pesaje' | 'compra'; fecha: string; conFactura: boolean; total: number;
  anuladaAt: string | null; proveedor: string; cargadoPor: string; resumen: string;
}

export const useMaterias = () => useQuery({ queryKey: ['materias'], queryFn: () => api<MateriaPrima[]>('/materias') });
export const useProveedores = (q = '', tipo = '') =>
  useQuery({ queryKey: ['proveedores', q, tipo], queryFn: () => api<Proveedor[]>(`/proveedores?q=${encodeURIComponent(q)}&tipo=${tipo}`) });

export interface Maquina { id: string; codigo: string; nombre: string; activo: boolean }
export interface Variante {
  id: string; codigo: string; nombre: string; tamano: 'chico' | 'grande'; color: string | null; colorHex: string | null;
  maquinaId: string; maquina: string; maplesPorPaquete: number; maplesPorHora: number; activo: boolean;
  receta: { materiaPrimaId: string; cantidadPorHora: number; nombre: string; unidad: Unidad }[];
}
export interface Empleado { id: string; nombre: string; turnoHabitual: 'manana' | 'tarde' | null; activo: boolean }
export interface Empresa { razonSocial: string; direccion: string | null; telefono: string | null; email: string | null; cuit: string | null }
export interface StockMaple { id: string; codigo: string; nombre: string; colorHex: string | null; maplesPorPaquete: number; activo: boolean; producido: number; enPalets: number }

export const useMaquinas = () => useQuery({ queryKey: ['maquinas'], queryFn: () => api<Maquina[]>('/maquinas') });
export const useVariantes = () => useQuery({ queryKey: ['variantes'], queryFn: () => api<Variante[]>('/variantes') });
export const useEmpleados = () => useQuery({ queryKey: ['empleados'], queryFn: () => api<Empleado[]>('/empleados') });
export const useEmpresa = () => useQuery({ queryKey: ['empresa'], queryFn: () => api<Empresa>('/empresa'), staleTime: Infinity });
export const useStockMaples = (enabled = true) => useQuery({ queryKey: ['stock-maples'], queryFn: () => api<StockMaple[]>('/stock-maples'), enabled });
