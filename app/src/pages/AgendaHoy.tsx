import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Pencil, Repeat, Users } from 'lucide-react';
import { LABEL_REPETIR, type Repeticion } from '@moldeados/shared/base';
import { api, verFecha } from '../api';

export interface ItemAgenda {
  id: string; fecha: string; hora: string | null; titulo: string; detalle: string | null; repetir: Repeticion; paraTodos: boolean;
  creador: string; personas: { id: string; nombre: string }[]; puedeEditar: boolean; hecho: { por: string; at: string } | null; atrasado: boolean;
}

export const useAgenda = (desde?: string, hasta?: string, todos = false) => useQuery({
  queryKey: ['agenda', desde ?? 'hoy', hasta ?? '', todos],
  queryFn: () => api<{ hoy: string; items: ItemAgenda[] }>(`/agenda?${new URLSearchParams({ ...(desde && { desde }), ...(hasta && { hasta }), ...(todos && { todos: '1' }) })}`),
});

const paraQuien = (x: ItemAgenda) => (x.paraTodos ? 'Todo el equipo' : x.personas.map((p) => p.nombre.split(' ')[0]).join(', '));

/** Un renglón de la agenda: el círculo marca hecho (para todos), el lápiz edita. */
export function RenglonAgenda({ x, conFecha }: { x: ItemAgenda; conFecha?: boolean }) {
  const qc = useQueryClient();
  const marcar = async () => {
    // Se marca en pantalla al instante; si falla, vuelve atrás al recargar.
    await api(`/agenda/${x.id}/hecho`, { method: 'POST', body: { fecha: x.fecha, hecho: !x.hecho } }).catch(() => {});
    void qc.invalidateQueries({ queryKey: ['agenda'] });
  };
  return (
    <div className={`renglon-agenda${x.hecho ? ' hecho' : ''}${x.atrasado ? ' atrasado' : ''}`}>
      <button className="tilde" onClick={marcar} aria-pressed={!!x.hecho} aria-label={x.hecho ? `Desmarcar: ${x.titulo}` : `Marcar hecho: ${x.titulo}`}>
        {x.hecho && <Check size={18} aria-hidden />}
      </button>
      <div className="cuerpo">
        <div className="titulo">{x.hora && <span className="hora">{x.hora}</span>}{x.titulo}</div>
        {x.detalle && <div className="chico">{x.detalle}</div>}
        <div className="chico tenue meta">
          {(conFecha || x.atrasado) && <span>{x.atrasado ? `Era para el ${verFecha(x.fecha)}` : verFecha(x.fecha)}</span>}
          <span><Users size={13} aria-hidden /> {paraQuien(x)}</span>
          {x.repetir !== 'no' && <span><Repeat size={13} aria-hidden /> {LABEL_REPETIR[x.repetir]}</span>}
          {x.hecho && <span className="ok">Hecho por {x.hecho.por.split(' ')[0]}</span>}
        </div>
      </div>
      {x.puedeEditar && <Link className="boton icono" to={`/agenda/${x.id}`} aria-label={`Editar: ${x.titulo}`}><Pencil size={18} /></Link>}
    </div>
  );
}

/** Bloque del inicio: lo de hoy y lo atrasado. Si no hay nada, no ocupa lugar. */
export function AgendaHoy() {
  const { data } = useAgenda();
  const items = (data?.items ?? []).filter((x) => x.atrasado || x.fecha === data?.hoy);
  if (!items.length) return null;
  const pendientes = items.filter((x) => !x.hecho).length;
  return (
    <section className="hoja">
      <div className="fila">
        <div><h3>Agenda de hoy</h3><p className="chico tenue">{pendientes ? `${pendientes} sin hacer` : 'Todo hecho'}</p></div>
        <Link to="/agenda" className="chico">Ver agenda</Link>
      </div>
      {items.map((x) => <RenglonAgenda key={x.id + x.fecha} x={x} />)}
    </section>
  );
}
