import { createPortal } from 'react-dom';
import { useEffect, useId, useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { ArrowLeft, Check, Info, Pencil, Search, SlidersHorizontal, X } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, useSesion } from './api';

// Componentes propios. Sin librerías de UI: todo lo de acá se pensó para tocar con el dedo en planta.

export function Campo({ etiqueta, ayuda, children }: { etiqueta: string; ayuda?: string; children: ReactNode }) {
  return (
    <label className="campo">
      <span>{etiqueta}</span>
      {children}
      {ayuda && <small>{ayuda}</small>}
    </label>
  );
}

type EntradaProps = InputHTMLAttributes<HTMLInputElement> & { unidad?: string; enorme?: boolean };
export function Entrada({ unidad, enorme, className, ...props }: EntradaProps) {
  const input = <input {...props} className={`entrada${enorme ? ' enorme' : ''} ${className ?? ''}`} />;
  return unidad ? <div className="con-unidad">{input}<em>{unidad}</em></div> : input;
}

/** Número con coma o punto (teclado numérico en el celular). */
export function EntradaNumero(props: Omit<EntradaProps, 'type' | 'inputMode'>) {
  return <Entrada {...props} type="text" inputMode="decimal" autoComplete="off" />;
}

export function Buscador(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="buscador">
      <Search size={18} aria-hidden />
      <input {...props} className="entrada" type="search" />
    </div>
  );
}

/** `tono`: color del detalle según el estado (rojo debe / vence, verde al día). */
export interface Opcion<T> { valor: T; titulo: string; detalle?: ReactNode; tono?: 'critico' | 'atencion' | 'ok' }
/** Elegir uno entre pocos: opciones grandes en lugar de un desplegable. */
export function Opciones<T>({ opciones, valor, onChange, columnas }: { opciones: Opcion<T>[]; valor: T | null; onChange: (v: T) => void; columnas?: boolean }) {
  return (
    <div className={`opciones${columnas ? ' dos' : ''}`} role="group">
      {opciones.map((o) => (
        <button type="button" key={String(o.valor)} className="opcion" aria-pressed={o.valor === valor} onClick={() => onChange(o.valor)}>
          <span className="marca-op" aria-hidden />
          <span>
            <b>{o.titulo}</b>
            {o.detalle && <small className={o.tono ? `tono-${o.tono}` : undefined}>{o.detalle}</small>}
          </span>
        </button>
      ))}
    </div>
  );
}

export function Aviso({ children, ok }: { children: ReactNode; ok?: boolean }) {
  if (!children) return null;
  return <div className={`aviso${ok ? ' ok' : ''}`} role={ok ? 'status' : 'alert'}>{children}</div>;
}

export function Cargando() {
  return <p className="tenue" role="status">Cargando…</p>;
}

/** Fila de alvéolos de maple: uno por paso; se "llenan" de cartón a medida que avanzás. */
export function Alveolos({ total, actual }: { total: number; actual: number }) {
  return (
    <div className="alveolos" aria-label={`Paso ${actual + 1} de ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`alveolo${i < actual ? ' hecho' : ''}${i === actual ? ' actual' : ''}`} />
      ))}
      <span className="paso-de">Paso {actual + 1} de {total}</span>
    </div>
  );
}

export interface Paso {
  titulo: string;
  /** Instructivo del paso: qué hacer, en una o dos frases. */
  ayuda: string;
  contenido: ReactNode;
  /** Si es false, no se puede seguir. Opcional: mensaje de por qué. */
  listo: boolean | string;
  /** Paso de una sola elección: al tocar una opción pasa solo al siguiente (un toque en vez de dos). */
  rapido?: boolean;
}

/** Asistente: un paso por pantalla, con su instructivo y el avance en alvéolos. */
export function Asistente({ proceso, pasos, onTerminar, textoTerminar, guardando, error, onCancelar }: {
  /** Identifica el proceso para guardar sus instructivos editados (ej. "pesaje"). */
  proceso: string;
  pasos: Paso[];
  onTerminar: () => void;
  textoTerminar: string;
  guardando?: boolean;
  error?: string | null;
  onCancelar: () => void;
}) {
  const [i, setI] = useState(0);
  const paso = pasos[Math.min(i, pasos.length - 1)]!;
  const ultimo = i >= pasos.length - 1;
  const titulo = useRef<HTMLHeadingElement>(null);
  useEffect(() => titulo.current?.focus(), [i]);
  const puedeSeguir = paso.listo === true;
  // Paso rápido: al tocar una opción queda "esperando" y, apenas el paso está completo (la opción ya se marcó en la
  // pantalla), pasa solo al siguiente. Se espera a que el paso esté listo porque el toque llega antes que la elección.
  const [esperando, setEsperando] = useState(false);
  useEffect(() => setEsperando(false), [i]);
  // Salir desde cualquier paso (antes había que volver de a uno). Si ya avanzó, pregunta: lo cargado se pierde.
  const [confirmarSalir, setConfirmarSalir] = useState(false);
  const salir = () => (i === 0 ? onCancelar() : setConfirmarSalir(true));
  useEffect(() => {
    if (!esperando || !paso.rapido || paso.listo !== true || ultimo) return;
    const t = setTimeout(() => { setEsperando(false); setI((x) => x + 1); }, 200); // un instante para que se vea la opción marcada
    return () => clearTimeout(t);
  }, [esperando, paso.listo, paso.rapido, ultimo]);

  const seguir = () => {
    if (!puedeSeguir) return;
    if (ultimo) onTerminar();
    else setI(i + 1);
  };

  return (
    <form className="asistente columna" onSubmit={(e) => { e.preventDefault(); seguir(); }}>
      <div className="asistente-cabeza">
        <Alveolos total={pasos.length} actual={i} />
        <button type="button" className="boton fantasma salir-asistente" onClick={salir} aria-label="Salir de la carga"><X size={18} aria-hidden /> Salir</button>
      </div>
      {confirmarSalir && (
        <Dialogo titulo="¿Salir sin guardar?" onCerrar={() => setConfirmarSalir(false)}>
          <p>Lo que cargaste en estos pasos no se guarda.</p>
          <div className="acciones">
            <button type="button" className="boton secundario" onClick={() => setConfirmarSalir(false)}>Seguir cargando</button>
            <button type="button" className="boton peligro" onClick={() => { setConfirmarSalir(false); onCancelar(); }}>Salir sin guardar</button>
          </div>
        </Dialogo>
      )}
      <div className="paso-cuerpo" key={i} onClickCapture={(e) => { if ((e.target as HTMLElement).closest('.opcion, [data-elige]')) setEsperando(true); }}>
        <h1 ref={titulo} tabIndex={-1}>{paso.titulo}</h1>
        <Instructivo clave={`${proceso}:${paso.titulo}`} original={paso.ayuda} />
        {paso.contenido}
        {typeof paso.listo === 'string' && <p className="chico tenue">{paso.listo}</p>}
        {ultimo && <Aviso>{error}</Aviso>}
      </div>
      <div className="paso-acciones">
        <button type="button" className="boton secundario" onClick={() => (i === 0 ? onCancelar() : setI(i - 1))}>
          <ArrowLeft size={18} aria-hidden /> {i === 0 ? 'Cancelar' : 'Atrás'}
        </button>
        <button type="submit" className="boton primario grande" disabled={!puedeSeguir || guardando}>
          {ultimo ? <><Check size={20} aria-hidden /> {guardando ? 'Guardando…' : textoTerminar}</> : 'Siguiente'}
        </button>
      </div>
    </form>
  );
}

export function Dialogo({ titulo, children, onCerrar }: { titulo: string; children: ReactNode; onCerrar: () => void }) {
  const id = useId();
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onCerrar]);
  // Portal al body: si el diálogo se abre desde la barra de arriba (que tiene desenfoque), "fixed" quedaría atado a
  // la barra y se cortaría en el iPhone.
  return createPortal(
    <div className="velo" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="dialogo" role="dialog" aria-modal="true" aria-labelledby={id}>
        <h2 id={id}>{titulo}</h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Filtros de un listado que no se usan a diario (fechas, categoría, exportar): plegados para que los datos aparezcan
 * arriba. Se abren solos si hay alguno puesto, y de entrada en pantallas anchas.
 */
/** `resumen`: lo que se está mostrando sin filtros puestos (ej. "Este mes"), para que no quede escondido. */
export function MasFiltros({ activos, resumen, children }: { activos: number; resumen?: string; children: ReactNode }) {
  const [abierto] = useState(() => activos > 0 || (typeof window !== 'undefined' && window.innerWidth >= 1000));
  return (
    <details className="mas-filtros" open={abierto}>
      <summary><SlidersHorizontal size={16} aria-hidden /> {activos ? `Filtros (${activos})` : resumen ? `${resumen} · cambiar` : 'Fechas y más filtros'}</summary>
      <div className="mas-filtros-cuerpo">{children}</div>
    </details>
  );
}

/** `dato`: la bajada es información (ej. el período), no una explicación: se ve también en el iPhone. */
export function Cabecera({ titulo, bajada, dato, children }: { titulo: string; bajada?: ReactNode; dato?: boolean; children?: ReactNode }) {
  return (
    <header className="cabecera">
      <div>
        <h1>{titulo}</h1>
        {bajada && <p className={dato ? 'tenue' : 'tenue explicacion'}>{bajada}</p>}
      </div>
      {children}
    </header>
  );
}

/**
 * Cuadro de ayuda del paso. El dueño (o quien maneja el equipo) lo puede reescribir ahí mismo con el lápiz;
 * el cambio vale para todos. "Volver al original" borra la versión editada.
 */
function Instructivo({ clave, original }: { clave: string; original: string }) {
  const { puede } = useSesion();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['instructivos'], queryFn: () => api<Record<string, string>>('/instructivos'), staleTime: Infinity });
  const actual = data?.[clave] ?? original;
  const [editando, setEditando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const guardar = async (texto: string | null) => {
    setError(null);
    try {
      await api('/instructivos', { method: 'PUT', body: { clave, texto } });
      await qc.invalidateQueries({ queryKey: ['instructivos'] });
      setEditando(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    }
  };

  if (editando !== null) {
    return (
      <div className="instructivo editando">
        <textarea className="entrada" value={editando} onChange={(e) => setEditando(e.target.value)} autoFocus aria-label="Texto del instructivo" />
        <Aviso>{error}</Aviso>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="boton primario" onClick={() => guardar(editando.trim())}>Guardar instructivo</button>
          {data?.[clave] && <button type="button" className="boton secundario" onClick={() => guardar(null)}>Volver al original</button>}
          <button type="button" className="boton fantasma" onClick={() => setEditando(null)}>Cancelar</button>
        </div>
      </div>
    );
  }
  return (
    <div className="instructivo">
      <Info size={18} aria-hidden />
      <p style={{ flex: 1, whiteSpace: 'pre-line' }}>{actual}</p>
      {puede('usuarios', 3) && <button type="button" className="boton icono" aria-label="Editar instructivo" onClick={() => setEditando(actual)} style={{ minHeight: 32, width: 32 }}><Pencil size={16} /></button>}
    </div>
  );
}
