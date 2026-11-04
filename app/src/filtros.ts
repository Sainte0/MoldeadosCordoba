import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

/**
 * Filtros de un listado guardados en la URL (?desde=…&q=…): se puede recargar, guardar el link o mandarlo por
 * WhatsApp y abre igual. Lo que coincide con el valor por defecto no se escribe, así los links quedan cortos.
 */
export function useFiltros<T extends Record<string, string>>(defaults: T): [T, (cambios: Partial<T>) => void] {
  const [params, setParams] = useSearchParams();
  const valores = Object.fromEntries(Object.entries(defaults).map(([k, d]) => [k, params.get(k) ?? d])) as T;
  const set = (cambios: Partial<T>) =>
    setParams((prev) => {
      const n = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(cambios)) {
        if (v === undefined || v === defaults[k]) n.delete(k);
        else n.set(k, v as string);
      }
      return n;
    }, { replace: true });
  return [valores, set];
}

/** Valor con demora: la búsqueda pega a la API cuando se deja de escribir, no en cada letra. */
export function useDemorado<T>(valor: T, ms = 300): T {
  const [v, setV] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setV(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return v;
}

/** Sin acentos ni mayúsculas, para buscar como escribe la gente. */
export const normalizar = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/**
 * Pantallas de detalle: la dirección muestra el número que se ve en papel (/palets/12). Si se entró con el id largo
 * (enlace viejo, QR ya pegado), se reemplaza por el número sin sumar un paso al "Atrás".
 */
export function useUrlConNumero(base: string, param: string | undefined, numero: number | undefined): void {
  const ir = useNavigate();
  const { search } = useLocation();
  useEffect(() => {
    if (numero !== undefined && param && param !== String(numero)) ir(`${base}/${numero}${search}`, { replace: true });
  }, [base, param, numero]); // eslint-disable-line react-hooks/exhaustive-deps
}
