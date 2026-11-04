import { useEffect, useRef } from 'react';
import { apiBase, tokenActual } from './api';

export interface AvisoVivo { id: string; tipo: string; titulo: string; detalle: string | null; ruta: string | null; creada: string }

/**
 * Avisos en vivo: una conexión que queda abierta y el servidor empuja cada aviso al instante. Se lee con fetch (no
 * EventSource) para mandar el token en la cabecera. Si se corta (sin señal, el iPhone suspendió la app), reintenta
 * con espera creciente y vuelve a conectar apenas la app vuelve a primer plano.
 */
export function useAvisosEnVivo(activo: boolean, alAviso: (a: AvisoVivo) => void, alConectar: () => void): void {
  const cb = useRef({ alAviso, alConectar });
  cb.current = { alAviso, alConectar };

  useEffect(() => {
    if (!activo) return;
    let corte = new AbortController();
    let espera = 3000;
    let reintento: ReturnType<typeof setTimeout> | undefined;
    let vivo = true;
    let conectado = false;

    const conectar = async () => {
      clearTimeout(reintento);
      const t = tokenActual();
      if (!vivo || !t || conectado) return;
      corte = new AbortController();
      try {
        const res = await fetch(`${apiBase}/notificaciones/vivo`, { headers: { Authorization: `Bearer ${t}` }, signal: corte.signal });
        if (!res.ok || !res.body) throw new Error(String(res.status));
        conectado = true;
        espera = 3000;
        cb.current.alConectar(); // trae lo que haya llegado mientras estaba desconectado
        const lector = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let resto = '';
        for (;;) {
          const { value, done } = await lector.read();
          if (done) break;
          resto += value;
          const bloques = resto.split('\n\n');
          resto = bloques.pop() ?? '';
          for (const b of bloques) {
            const evento = /^event: (.+)$/m.exec(b)?.[1];
            const datos = /^data: (.+)$/m.exec(b)?.[1];
            if (evento === 'aviso' && datos) { try { cb.current.alAviso(JSON.parse(datos) as AvisoVivo); } catch { /* bloque roto: se ignora */ } }
          }
        }
      } catch { /* sin señal o cortado: se reintenta abajo */ }
      conectado = false;
      if (vivo) { reintento = setTimeout(conectar, espera); espera = Math.min(espera * 2, 60_000); }
    };
    const alVolver = () => { if (document.visibilityState === 'visible') { espera = 3000; void conectar(); } };

    void conectar();
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('online', alVolver);
    return () => {
      vivo = false;
      clearTimeout(reintento);
      corte.abort();
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('online', alVolver);
    };
  }, [activo]);
}
