import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, verMomento } from '../api';
import { Cabecera, Cargando } from '../ui';

interface Evento { id: string; accion: string; entidad: string; entidadId: string | null; motivo: string | null; fecha: string; usuario: string | null; despues: Record<string, unknown> | null }

const ACCION: Record<string, string> = { crear: 'cargó', editar: 'editó', anular: 'anuló', borrar: 'dio de baja', ajustar: 'corrigió el stock de', login: 'entró al sistema' };
const ENTIDAD: Record<string, string> = { compra: 'una compra', proveedor: 'un proveedor', materia_prima: 'una materia prima', usuario: 'un usuario', permiso: 'un permiso' };

export function Registro() {
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['auditoria'],
    initialPageParam: '',
    queryFn: ({ pageParam }) => api<Evento[]>(`/auditoria?antesDe=${encodeURIComponent(pageParam)}`),
    getNextPageParam: (ult) => (ult.length === 50 ? ult[ult.length - 1]!.fecha : undefined),
  });
  const eventos = data?.pages.flat() ?? [];

  return (
    <div className="columna">
      <Cabecera titulo="Registro de cambios" bajada="Todo lo que se cargó, editó o anuló, con quién y cuándo." />
      {isLoading ? <Cargando /> : (
        <div className="hoja filas">
          {eventos.map((e) => (
            <div className="fila" key={e.id}>
              <div>
                <div>
                  <b>{e.usuario ?? 'Sistema'}</b> {ACCION[e.accion] ?? e.accion}{e.accion !== 'login' && ' '}
                  {e.accion !== 'login' && (e.entidad === 'compra' && e.entidadId && e.accion !== 'login' ? <Link to={`/compras/${e.entidadId}`}>{ENTIDAD[e.entidad]}</Link> : ENTIDAD[e.entidad] ?? e.entidad)}
                </div>
                {e.motivo && <div className="chico tenue">Motivo: {e.motivo}</div>}
              </div>
              <span className="chico tenue">{verMomento(e.fecha)}</span>
            </div>
          ))}
        </div>
      )}
      {hasNextPage && <button className="boton secundario" style={{ marginTop: 16 }} disabled={isFetchingNextPage} onClick={() => fetchNextPage()}>Ver anteriores</button>}
    </div>
  );
}
