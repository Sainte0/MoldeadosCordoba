import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { RECORRIDOS, type PasoRecorrido } from './recorridos';

// Recorrido guiado ("Mostrame cómo"): lleva a la pantalla, resalta el botón o campo de cada paso y lo explica en un
// globo. No bloquea: se puede tocar lo resaltado (o cualquier cosa) mientras tanto.

let actual: { titulo: string; pasos: PasoRecorrido[]; i: number } | null = null;
const oyentes = new Set<() => void>();
const avisar = () => oyentes.forEach((f) => f());
export const iniciarRecorrido = (id: string, titulo: string) => {
  const pasos = RECORRIDOS[id];
  if (pasos?.length) { actual = { titulo, pasos, i: 0 }; avisar(); }
};
export const hayRecorrido = (id: string) => !!RECORRIDOS[id]?.length;
const ir = (i: number) => { if (actual) { actual = { ...actual, i }; avisar(); } };
const terminar = () => { actual = null; avisar(); };
const useActual = () => useSyncExternalStore((f) => { oyentes.add(f); return () => oyentes.delete(f); }, () => actual);

/** El primero de los elementos que se vea en pantalla (el menú lateral escondido en el iPhone no cuenta). */
function buscar(sel: string): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>(sel)).find((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth;
  }) ?? null;
}

export function Recorrido() {
  const r = useActual();
  const navegar = useNavigate();
  const { pathname, search } = useLocation();
  const [caja, setCaja] = useState<DOMRect | null>(null);
  const [buscando, setBuscando] = useState(false);
  const elemento = useRef<HTMLElement | null>(null);
  const paso = r?.pasos[r.i];

  // Ir a la pantalla del paso (si tiene) y esperar a que aparezca lo que hay que mostrar.
  useEffect(() => {
    if (!paso) return;
    if (paso.ruta) {
      const [ruta, query = ''] = paso.ruta.split('?');
      if (pathname !== ruta || (query && search !== `?${query}`)) { navegar(paso.ruta); return; }
    }
    setBuscando(true);
    elemento.current = null;
    setCaja(null);
    let intentos = 0;
    const t = setInterval(() => {
      const el = buscar(paso.en);
      if (el || ++intentos > 25) {
        clearInterval(t);
        setBuscando(false);
        elemento.current = el;
        el?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      }
    }, 120);
    return () => clearInterval(t);
  }, [paso, pathname, search]); // eslint-disable-line react-hooks/exhaustive-deps

  // El resaltado sigue al elemento si la pantalla se mueve.
  useEffect(() => {
    if (!paso) return;
    let raf = 0;
    const seguir = () => {
      const el = elemento.current;
      setCaja((prev) => {
        if (!el || !el.isConnected) return null;
        const n = el.getBoundingClientRect();
        return prev && prev.x === n.x && prev.y === n.y && prev.width === n.width && prev.height === n.height ? prev : n;
      });
      raf = requestAnimationFrame(seguir);
    };
    raf = requestAnimationFrame(seguir);
    return () => cancelAnimationFrame(raf);
  }, [paso]);

  useEffect(() => {
    if (!r) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') terminar();
      if (e.key === 'ArrowRight' && r.i < r.pasos.length - 1) ir(r.i + 1);
      if (e.key === 'ArrowLeft' && r.i > 0) ir(r.i - 1);
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [r]);

  if (!r || !paso) return null;
  const ultimo = r.i === r.pasos.length - 1;
  const m = 6;
  // El globo va abajo, salvo que lo resaltado esté en la mitad de abajo de la pantalla.
  const arriba = !!caja && caja.top + caja.height / 2 > window.innerHeight * 0.55;

  return (
    <>
      {caja && <div className="recorrido-foco" aria-hidden style={{ top: caja.top - m, left: caja.left - m, width: caja.width + m * 2, height: caja.height + m * 2 }} />}
      {!caja && !buscando && <div className="recorrido-velo" aria-hidden />}
      <div className={`recorrido-globo${arriba ? ' arriba' : ''}`} role="dialog" aria-live="polite" aria-label={`Guía: ${r.titulo}`}>
        <div className="recorrido-cabeza">
          <span className="chico tenue">{r.titulo} · {r.i + 1} de {r.pasos.length}</span>
          <button className="boton icono" onClick={terminar} aria-label="Salir de la guía"><X size={20} /></button>
        </div>
        <p>{paso.texto}</p>
        {!caja && !buscando && <p className="chico tenue">Esto aparece en otro momento del proceso o según tu usuario.</p>}
        <div className="recorrido-puntos" aria-hidden>{r.pasos.map((_, i) => <i key={i} className={i === r.i ? 'activo' : ''} />)}</div>
        <div className="recorrido-acciones">
          {r.i > 0 && <button className="boton secundario" onClick={() => ir(r.i - 1)}>Anterior</button>}
          <button className="boton primario" onClick={() => (ultimo ? terminar() : ir(r.i + 1))}>{ultimo ? 'Listo' : 'Siguiente'}</button>
        </div>
      </div>
    </>
  );
}
