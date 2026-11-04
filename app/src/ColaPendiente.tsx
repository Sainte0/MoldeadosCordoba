import { CloudOff, RefreshCw, Trash2 } from 'lucide-react';
import { descartar, reintentar, subirPendientes, useSincronizar } from './cola';
import { usuarioActual } from './api';

/** Aviso arriba de todo: sin señal, o cargas guardadas en el teléfono esperando subir (y las que el sistema rechazó). */
export function ColaPendiente() {
  const { cola, enLinea } = useSincronizar();
  const yo = usuarioActual();
  const mias = cola.filter((p) => (p.usuarioId ?? yo) === yo);
  const deOtros = cola.length - mias.length;
  const esperando = mias.filter((p) => !p.error);
  const rechazadas = mias.filter((p) => p.error);
  if (enLinea && !mias.length && !deOtros) return null;
  return (
    <div className="cola" role="status">
      {(!enLinea || esperando.length > 0) && (
        <div className="cola-fila">
          <CloudOff size={18} aria-hidden />
          <span>
            {!enLinea ? 'Sin señal. Podés seguir cargando partes, despachos y pesajes: se suben solos cuando vuelva.' : ''}
            {esperando.length > 0 && ` ${esperando.length === 1 ? 'Hay 1 carga guardada' : `Hay ${esperando.length} cargas guardadas`} en este teléfono: ${esperando.map((p) => p.descripcion).join(', ')}.`}
          </span>
          {enLinea && esperando.length > 0 && <button className="boton fantasma" onClick={() => void subirPendientes()}><RefreshCw size={16} aria-hidden /> Subir ahora</button>}
        </div>
      )}
      {rechazadas.map((p) => (
        <div className="cola-fila cola-error" key={p.id}>
          <span><b>{p.descripcion}</b> no se pudo subir: {p.error}</span>
          <button className="boton fantasma" onClick={() => reintentar(p.id)}><RefreshCw size={16} aria-hidden /> Reintentar</button>
          <button className="boton fantasma" onClick={() => descartar(p.id)}><Trash2 size={16} aria-hidden /> Descartar</button>
        </div>
      ))}
      {deOtros > 0 && <div className="cola-fila"><span>En este teléfono hay {deOtros === 1 ? '1 carga guardada' : `${deOtros} cargas guardadas`} de otra persona: se suben cuando esa persona vuelva a entrar.</span></div>}
    </div>
  );
}
