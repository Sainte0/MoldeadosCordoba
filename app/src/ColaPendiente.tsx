import { CloudOff, RefreshCw, Trash2 } from 'lucide-react';
import { descartar, subirPendientes, useSincronizar } from './cola';

/** Aviso arriba de todo: sin señal, o cargas guardadas en el teléfono esperando subir (y las que el sistema rechazó). */
export function ColaPendiente() {
  const { cola, enLinea } = useSincronizar();
  const esperando = cola.filter((p) => !p.error);
  const rechazadas = cola.filter((p) => p.error);
  if (enLinea && !cola.length) return null;
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
          <button className="boton fantasma" onClick={() => descartar(p.id)}><Trash2 size={16} aria-hidden /> Descartar</button>
        </div>
      ))}
    </div>
  );
}
