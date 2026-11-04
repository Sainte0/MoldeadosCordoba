import { useEffect, useState, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, ErrorApi, usuarioActual } from './api';

// Cargas hechas sin señal (parte, despacho, pesaje): se guardan en el teléfono y se suben solas cuando vuelve la
// conexión. Cada una lleva una clave única: si un envío llegó pero se cortó la respuesta, el servidor no la
// duplica. Si el servidor la rechaza (por ejemplo, ese palet ya se vendió desde otro equipo), queda marcada con
// el motivo para que alguien la revise.

export interface Pendiente { id: string; usuarioId: string | null; ruta: string; body: unknown; descripcion: string; creado: string; error?: string }
const CLAVE = 'moldeados_cola';
const oyentes = new Set<() => void>();

function leer(): Pendiente[] {
  try { return JSON.parse(localStorage.getItem(CLAVE) ?? '[]') as Pendiente[]; } catch { return []; }
}
let cache = leer();
function guardar(lista: Pendiente[]) {
  cache = lista;
  try { localStorage.setItem(CLAVE, JSON.stringify(lista)); } catch { /* sin espacio: queda en memoria mientras la app esté abierta */ }
  oyentes.forEach((f) => f());
}
const suscribir = (f: () => void) => { oyentes.add(f); return () => oyentes.delete(f); };
export const useCola = () => useSyncExternalStore(suscribir, () => cache);

/**
 * Envía la carga; si no hay señal la guarda para después. Devuelve 'guardado' (quedó en el teléfono) o la
 * respuesta del servidor. Cualquier otro error (datos inválidos, sin permiso) se lanza como siempre.
 */
export async function enviarOGuardar<T>(ruta: string, body: unknown, descripcion: string): Promise<{ guardado: true } | { guardado: false; data: T }> {
  const id = crypto.randomUUID();
  try {
    return { guardado: false, data: await api<T>(ruta, { method: 'POST', body, clave: id }) };
  } catch (e) {
    if (!(e instanceof ErrorApi) || !e.sinConexion) throw e;
    guardar([...cache, { id, usuarioId: usuarioActual(), ruta, body, descripcion, creado: new Date().toISOString() }]);
    return { guardado: true };
  }
}

export const descartar = (id: string) => guardar(cache.filter((p) => p.id !== id));
/** Volver a intentar una carga rechazada (por ejemplo, después de corregir algo en el sistema). */
export const reintentar = (id: string) => guardar(cache.map((p) => (p.id === id ? { ...p, error: undefined } : p)));
let subiendo = false;

/** Sube lo pendiente en orden. Corta en la primera falta de señal; lo rechazado queda marcado. */
export async function subirPendientes(): Promise<number> {
  if (subiendo) return 0;
  subiendo = true;
  let subidos = 0;
  try {
    // Solo las cargas de quien tiene la sesión: si otra persona entra en este teléfono, lo pendiente de la anterior
    // espera a que vuelva a entrar (si no, quedaría registrado a nombre de quien no lo hizo).
    const yo = usuarioActual();
    for (const p of cache.filter((x) => !x.error && (x.usuarioId ?? yo) === yo)) {
      try {
        await api(p.ruta, { method: 'POST', body: p.body, clave: p.id });
        guardar(cache.filter((x) => x.id !== p.id));
        subidos++;
      } catch (e) {
        if (e instanceof ErrorApi && e.sinConexion) break;
        // Sesión vencida (más de 7 días sin entrar): no es un rechazo, espera a que la persona vuelva a entrar.
        if (e instanceof ErrorApi && e.status === 401) break;
        guardar(cache.map((x) => (x.id === p.id ? { ...x, error: e instanceof Error ? e.message : 'El sistema no la aceptó' } : x)));
      }
    }
  } finally {
    subiendo = false;
  }
  return subidos;
}

/** Al volver la señal, y cada 20 s mientras haya pendientes, intenta subir. Refresca los datos al terminar. */
export function useSincronizar() {
  const qc = useQueryClient();
  const cola = useCola();
  const [enLinea, setEnLinea] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setEnLinea(true);
    const off = () => setEnLinea(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  const yo = usuarioActual();
  const hay = cola.some((p) => !p.error && (p.usuarioId ?? yo) === yo);
  useEffect(() => {
    if (!hay) return;
    const intentar = () => { void subirPendientes().then((n) => { if (n) void qc.invalidateQueries(); }); };
    intentar();
    const t = setInterval(intentar, 20_000);
    return () => clearInterval(t);
  }, [hay, enLinea, qc]);
  return { cola, enLinea };
}
