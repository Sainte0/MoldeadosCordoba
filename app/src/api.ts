import { createContext, createElement, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Modulo, Nivel, Rol } from '@moldeados/shared';

const BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:4800') + '/api';
const CLAVE = 'moldeados_sesion';

export interface Usuario { id: string; nombre: string; usuario: string; rol: Rol; activo: boolean }
type Permisos = Record<Modulo, Nivel>;
interface Sesion { token: string; usuario: Usuario; permisos: Permisos }

let token: string | null = null;
let alExpirar: () => void = () => {};

export class ErrorApi extends Error {}

/** fetch a la API con el token. Devuelve `data`; si falla lanza ErrorApi con el mensaje ya pensado para el usuario. */
export async function api<T>(ruta: string, opciones: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + ruta, {
      method: opciones.method ?? 'GET',
      headers: { ...(opciones.body !== undefined && { 'Content-Type': 'application/json' }), ...(token && { Authorization: `Bearer ${token}` }) },
      body: opciones.body !== undefined ? JSON.stringify(opciones.body) : undefined,
    });
  } catch {
    throw new ErrorApi('No hay conexión con el sistema. Revisá internet y probá de nuevo.');
  }
  const json = await res.json().catch(() => null);
  if (res.status === 401 && token) alExpirar();
  if (!res.ok) throw new ErrorApi(json?.error?.message ?? 'Algo falló. Probá de nuevo en un momento.');
  return json.data as T;
}

interface Ctx {
  sesion: Sesion | null;
  entrar: (usuario: string, password: string) => Promise<void>;
  salir: () => void;
  puede: (modulo: Modulo, nivel?: Nivel) => boolean;
}
const SesionCtx = createContext<Ctx | null>(null);

function leer(): Sesion | null {
  try {
    const s = localStorage.getItem(CLAVE);
    return s ? (JSON.parse(s) as Sesion) : null;
  } catch {
    return null;
  }
}

export function SesionProvider({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Sesion | null>(() => {
    const s = leer();
    token = s?.token ?? null;
    return s;
  });

  const guardar = (s: Sesion | null) => {
    token = s?.token ?? null;
    setSesion(s);
    try {
      if (s) localStorage.setItem(CLAVE, JSON.stringify(s));
      else localStorage.removeItem(CLAVE);
    } catch {
      /* navegador sin storage: la sesión vive mientras la pestaña esté abierta */
    }
  };

  useEffect(() => {
    alExpirar = () => guardar(null);
    // Refresca rol y permisos al abrir: si el dueño los cambió, aplican sin volver a entrar.
    if (token) {
      api<{ usuario: Usuario; permisos: Permisos }>('/auth/yo')
        .then((r) => { const t = token; if (t) guardar({ token: t, ...r }); })
        .catch(() => {});
    }
  }, []);

  const valor = useMemo<Ctx>(
    () => ({
      sesion,
      entrar: async (usuario, password) => guardar(await api<Sesion>('/auth/login', { method: 'POST', body: { usuario, password } })),
      salir: () => guardar(null),
      puede: (modulo, nivel = 1) => (sesion?.permisos[modulo] ?? 0) >= nivel,
    }),
    [sesion],
  );
  return createElement(SesionCtx.Provider, { value: valor }, children);
}

export function useSesion(): Ctx {
  const c = useContext(SesionCtx);
  if (!c) throw new Error('useSesion fuera de SesionProvider');
  return c;
}

/** Fecha de hoy en Argentina, 'YYYY-MM-DD'. */
export const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());

const fmtFecha = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const fmtHora = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' });
/** 'YYYY-MM-DD' (columna date) → "3 nov 2026". */
export const verFecha = (d: string) => fmtFecha.format(new Date(d + 'T00:00:00Z'));
/** timestamp → "3 nov, 14:05" en hora Argentina. */
export const verMomento = (iso: string) => fmtHora.format(new Date(iso));
export const nroTicket = (n: number) => String(n).padStart(6, '0');
