import { Component, lazy, type ComponentType, type ReactNode } from 'react';

// Después de un deploy, el iPhone sigue con la versión vieja abierta en memoria: al entrar a una pantalla que todavía no
// había abierto, pide un archivo que ya no existe y React deja la pantalla en blanco. Acá: si falla la carga de una
// pantalla, se recarga la app una vez (trae la versión nueva); y cualquier otro error muestra un aviso, nunca blanco.

const CLAVE = 'moldeados:recargado';
const esCarga = (e: unknown) => /dynamically imported module|Importing a module script failed|Failed to fetch|error loading dynamically|ChunkLoadError|text\/html/i.test(String((e as Error)?.message ?? e));

function recargarUnaVez(): boolean {
  try {
    const ultima = Number(sessionStorage.getItem(CLAVE) ?? 0);
    if (Date.now() - ultima < 30_000) return false; // ya se recargó recién: no entrar en un bucle
    sessionStorage.setItem(CLAVE, String(Date.now()));
  } catch { /* sin almacenamiento: se recarga igual */ }
  window.location.reload();
  return true;
}

/** `lazy` que, si el archivo de la pantalla ya no existe (versión nueva), recarga la app en vez de romperse. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cargar<T extends ComponentType<any>>(f: () => Promise<{ default: T }>) {
  return lazy(() => f().catch((e) => {
    if (navigator.onLine && esCarga(e) && recargarUnaVez()) return new Promise<{ default: T }>(() => {});
    throw e;
  }));
}

export class Recuperar extends Component<{ children: ReactNode; clave: string }, { error: unknown }> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) { return { error }; }
  componentDidCatch(error: unknown) { if (navigator.onLine && esCarga(error)) recargarUnaVez(); }
  componentDidUpdate(prev: { clave: string }) { if (prev.clave !== this.props.clave && this.state.error) this.setState({ error: null }); }
  render() {
    if (!this.state.error) return this.props.children;
    const sinSenal = !navigator.onLine;
    return (
      <div className="hoja relleno" role="alert" style={{ display: 'grid', gap: 12, maxWidth: 520 }}>
        <h2>{sinSenal ? 'Esta pantalla necesita señal' : 'No se pudo abrir esta pantalla'}</h2>
        <p className="tenue">{sinSenal ? 'Es la primera vez que la abrís en este teléfono. Cuando vuelva la señal, tocá Recargar.' : 'Tocá Recargar para traer la última versión del sistema.'}</p>
        <div className="acciones" style={{ justifyContent: 'flex-start' }}>
          <button className="boton primario" onClick={() => window.location.reload()}>Recargar</button>
          <a className="boton secundario" href="/">Ir a Hoy</a>
        </div>
      </div>
    );
  }
}
