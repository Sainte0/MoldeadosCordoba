import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { aCentavos, formatPesos } from '@moldeados/shared';
import { api, useSesion } from '../api';
import { Muestra } from '../MapleVista';
import { Aviso, Cabecera, Cargando, EntradaNumero } from '../ui';

interface Fila { id: string; codigo: string; nombre: string; colorHex: string | null; maplesPorPaquete: number; precioMaple: number; activo: boolean; especiales: number }

/** Lista de precios por maple. Los precios especiales de cada cliente se cargan en su ficha. */
export function Precios() {
  const { puede } = useSesion();
  const edita = puede('ventas', 3);
  const { data, isLoading, refetch } = useQuery({ queryKey: ['precios'], queryFn: () => api<Fila[]>('/precios') });
  const [editando, setEditando] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const guardar = async (f: Fila) => {
    const p = aCentavos(editando[f.id] ?? '');
    if (p === null || p < 0) return setError(`El precio del ${f.codigo} no es válido`);
    setError(null);
    try {
      await api('/precios', { method: 'PUT', body: { varianteId: f.id, clienteId: null, precioMaple: p } });
      await refetch();
      setEditando(({ [f.id]: _, ...resto }) => resto);
      setOk(`Precio del ${f.codigo} actualizado.`);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar'); }
  };

  return (
    <div className="columna">
      <Cabecera titulo="Precios" bajada="Precio de lista por maple, sin IVA. Para un cliente con otro precio, cargalo en su ficha." />
      <Aviso>{error}</Aviso>
      {ok && <Aviso ok>{ok}</Aviso>}
      {isLoading ? <Cargando /> : (
        <div className="hoja filas" style={{ marginTop: 12 }}>
          {data?.filter((f) => f.activo).map((f) => (
            <div className="fila" key={f.id} style={{ gridTemplateColumns: '1fr auto' }}>
              <div className="con-muestra">
                <Muestra color={f.colorHex} grande />
                <div>
                  <div className="principal">{f.codigo}</div>
                  <div className="chico tenue">{f.precioMaple ? `${formatPesos(f.precioMaple * f.maplesPorPaquete)} el paquete de ${f.maplesPorPaquete}` : 'Sin precio'}{f.especiales ? ` · ${f.especiales} clientes con precio especial` : ''}</div>
                </div>
              </div>
              {edita && editando[f.id] !== undefined ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <EntradaNumero unidad="$" value={editando[f.id]} onChange={(e) => setEditando({ ...editando, [f.id]: e.target.value })} aria-label={`Precio por maple de ${f.codigo}`} style={{ width: 140 }} autoFocus />
                  <button className="boton primario" onClick={() => guardar(f)}>Guardar</button>
                </div>
              ) : (
                <button className="boton secundario" disabled={!edita} onClick={() => setEditando({ ...editando, [f.id]: f.precioMaple ? String(f.precioMaple / 100).replace('.', ',') : '' })}>
                  <span className="cifra">{f.precioMaple ? formatPesos(f.precioMaple) : 'Cargar'}</span>{f.precioMaple ? <span className="chico tenue">/maple</span> : null}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
