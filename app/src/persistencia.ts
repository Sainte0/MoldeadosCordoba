import type { QueryClient } from '@tanstack/react-query';
import type { Modulo, Nivel } from '@moldeados/shared/base';
import { api } from './api';

// Lo que los asistentes necesitan para cargar sin señal (máquinas, maples, personal, palets, clientes,
// proveedores, instructivos…) se guarda en el teléfono cada vez que se trae, y al abrir la app se repone.
// Así un parte o un despacho se pueden completar en el playón aunque no haya conexión.
// ponytail: solo estas consultas y en localStorage (son chicas); si crecen mucho, pasar a IndexedDB.

const CLAVE = 'moldeados_datos';
const GUARDAR = ['maquinas', 'variantes', 'empleados', 'materias', 'stock-maples', 'palets-disponibles', 'clientes', 'proveedores', 'instructivos', 'empresa', 'bancos', 'precios-cliente', 'categorias-gasto'];

export function persistirConsultas(qc: QueryClient): void {
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE) ?? '{}') as Record<string, { key: unknown[]; data: unknown; t: number }>;
    for (const q of Object.values(guardado)) qc.setQueryData(q.key, q.data, { updatedAt: q.t });
  } catch { /* nada guardado o ilegible: se arranca sin datos locales */ }

  let pendiente: ReturnType<typeof setTimeout> | null = null;
  qc.getQueryCache().subscribe((ev) => {
    if (ev.type !== 'updated' || ev.action.type !== 'success' || !GUARDAR.includes(String(ev.query.queryKey[0]))) return;
    if (pendiente) return;
    pendiente = setTimeout(() => {
      pendiente = null;
      const datos: Record<string, { key: unknown[]; data: unknown; t: number }> = {};
      for (const q of qc.getQueryCache().getAll()) {
        if (GUARDAR.includes(String(q.queryKey[0])) && q.state.status === 'success') datos[JSON.stringify(q.queryKey)] = { key: q.queryKey as unknown[], data: q.state.data, t: q.state.dataUpdatedAt };
      }
      try { localStorage.setItem(CLAVE, JSON.stringify(datos)); } catch { /* sin espacio: no se guarda, se sigue online */ }
    }, 1000);
  });
}

/**
 * Con señal, trae de antemano lo que usan los asistentes del playón (según lo que la persona puede cargar), así
 * queda guardado aunque nunca haya abierto esas pantallas. Si algo falla, no pasa nada: se trae cuando se abra.
 */
export function precargar(qc: QueryClient, puede: (m: Modulo, n?: Nivel) => boolean): void {
  if (!navigator.onLine) return;
  const traer = (key: unknown[], ruta: string) => void qc.prefetchQuery({ queryKey: key, queryFn: () => api(ruta), staleTime: 5 * 60_000 }).catch(() => {});
  traer(['instructivos'], '/instructivos');
  traer(['empresa'], '/empresa');
  if (puede('produccion', 2)) {
    traer(['maquinas'], '/maquinas'); traer(['variantes'], '/variantes'); traer(['empleados'], '/empleados');
    traer(['materias'], '/materias'); traer(['stock-maples'], '/stock-maples');
  }
  if (puede('ventas', 2)) { traer(['palets-disponibles'], '/palets-disponibles'); traer(['clientes', ''], '/clientes?q='); traer(['stock-maples'], '/stock-maples'); }
  if (puede('compras', 2)) { traer(['proveedores', '', 'carton'], '/proveedores?q=&tipo=carton'); traer(['materias'], '/materias'); }
}
