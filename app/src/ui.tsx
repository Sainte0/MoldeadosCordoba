import { useEffect, useId, useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { ArrowLeft, Check, Info, Search } from 'lucide-react';

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

export interface Opcion<T> { valor: T; titulo: string; detalle?: ReactNode }
/** Elegir uno entre pocos: opciones grandes en lugar de un desplegable. */
export function Opciones<T>({ opciones, valor, onChange, columnas }: { opciones: Opcion<T>[]; valor: T | null; onChange: (v: T) => void; columnas?: boolean }) {
  return (
    <div className={`opciones${columnas ? ' dos' : ''}`} role="group">
      {opciones.map((o) => (
        <button type="button" key={String(o.valor)} className="opcion" aria-pressed={o.valor === valor} onClick={() => onChange(o.valor)}>
          <span className="marca-op" aria-hidden />
          <span>
            <b>{o.titulo}</b>
            {o.detalle && <small>{o.detalle}</small>}
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
}

/** Asistente: un paso por pantalla, con su instructivo y el avance en alvéolos. */
export function Asistente({ pasos, onTerminar, textoTerminar, guardando, error, onCancelar }: {
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

  const seguir = () => {
    if (!puedeSeguir) return;
    if (ultimo) onTerminar();
    else setI(i + 1);
  };

  return (
    <form className="asistente columna" onSubmit={(e) => { e.preventDefault(); seguir(); }}>
      <Alveolos total={pasos.length} actual={i} />
      <div className="paso-cuerpo" key={i}>
        <h1 ref={titulo} tabIndex={-1}>{paso.titulo}</h1>
        <div className="instructivo"><Info size={18} aria-hidden /><p>{paso.ayuda}</p></div>
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
  return (
    <div className="velo" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="dialogo" role="dialog" aria-modal="true" aria-labelledby={id}>
        <h2 id={id}>{titulo}</h2>
        {children}
      </div>
    </div>
  );
}

export function Cabecera({ titulo, bajada, children }: { titulo: string; bajada?: ReactNode; children?: ReactNode }) {
  return (
    <header className="cabecera">
      <div>
        <h1>{titulo}</h1>
        {bajada && <p className="tenue">{bajada}</p>}
      </div>
      {children}
    </header>
  );
}
