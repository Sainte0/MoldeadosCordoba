import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, verMomento } from '../api';
import { useDemorado, useFiltros } from '../filtros';
import { Buscador, Cabecera, Campo, Cargando, Entrada } from '../ui';

interface Evento { id: string; accion: string; entidad: string; entidadId: string | null; motivo: string | null; fecha: string; usuario: string | null; despues: Record<string, unknown> | null }

const ACCION: Record<string, string> = { crear: 'cargó', editar: 'editó', anular: 'anuló', borrar: 'dio de baja', ajustar: 'corrigió el stock de', login: 'entró al sistema' };
const ENTIDAD: Record<string, string> = {
  compra: 'una compra', proveedor: 'un proveedor', materia_prima: 'una materia prima', usuario: 'un usuario', permiso: 'un permiso',
  maquina: 'una máquina', variante: 'un código de maple', empleado: 'una persona del personal', parte: 'un parte de producción', palet: 'un palet',
  empresa: 'los datos de la empresa', cliente: 'un cliente', venta: 'una venta', cobro: 'un cobro', pago: 'un pago', precio: 'un precio',
  banco: 'un banco', gasto: 'un egreso', categoria_gasto: 'una categoría de egresos', caja: 'la caja chica', instructivo: 'un instructivo',
  procedimiento: 'un procedimiento', importacion: 'una importación', pedido: 'un pedido', recordatorio: 'un recordatorio',
};
// Dónde se ve cada cosa (las pantallas de detalle aceptan el id y lo cambian por el número).
const ENLACE: Record<string, (id: string) => string> = {
  compra: (id) => `/compras/${id}`, venta: (id) => `/ventas/${id}`, palet: (id) => `/palets/${id}`, parte: (id) => `/produccion/${id}`,
  pedido: (id) => `/pedidos/${id}`, cliente: (id) => `/cuentas/cliente/${id}`, proveedor: (id) => `/cuentas/proveedor/${id}`, recordatorio: (id) => `/agenda/${id}`,
};
// "Qué": agrupado como lo piensa alguien de la fábrica, no como está guardado.
const QUE: { valor: string; texto: string }[] = [
  { valor: '', texto: 'Todo' },
  { valor: 'venta,pedido,cliente,precio', texto: 'Ventas, pedidos y clientes' },
  { valor: 'cobro,pago,banco,caja', texto: 'Cobros, pagos y caja' },
  { valor: 'gasto,categoria_gasto', texto: 'Egresos' },
  { valor: 'compra,proveedor,materia_prima', texto: 'Compras y materia prima' },
  { valor: 'parte,palet', texto: 'Producción y palets' },
  { valor: 'variante,maquina,empleado', texto: 'Maples, máquinas y personal' },
  { valor: 'usuario,permiso,empresa,instructivo,procedimiento,importacion', texto: 'Ajustes e importaciones' },
  { valor: 'recordatorio', texto: 'Agenda' },
];

export function Registro() {
  const [f, setF] = useFiltros({ que: '', quien: '', accion: '', desde: '', hasta: '', q: '' });
  const q = useDemorado(f.q);
  const { data: personas } = useQuery({ queryKey: ['agenda', 'personas'], queryFn: () => api<{ id: string; nombre: string }[]>('/agenda/personas') });
  const filtro = new URLSearchParams({ entidad: f.que, usuarioId: f.quien, accion: f.accion, desde: f.desde, hasta: f.hasta, q });
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['auditoria', filtro.toString()],
    initialPageParam: '',
    queryFn: ({ pageParam }) => api<Evento[]>(`/auditoria?${filtro}&antesDe=${encodeURIComponent(pageParam)}`),
    getNextPageParam: (ult) => (ult.length === 50 ? ult[ult.length - 1]!.fecha : undefined),
  });
  const eventos = data?.pages.flat() ?? [];
  const hayFiltro = Object.values(f).some(Boolean);

  return (
    <div className="columna" style={{ display: 'grid', gap: 16 }}>
      <Cabecera titulo="Registro de cambios" bajada="Todo lo que se cargó, editó o anuló, con quién y cuándo." />
      <div className="hoja relleno" style={{ display: 'grid', gap: 12 }}>
        <Buscador placeholder="Buscar un nombre, concepto, monto, comprobante o motivo" value={f.q} onChange={(e) => setF({ q: e.target.value })} aria-label="Buscar en el registro" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <Campo etiqueta="Qué">
            <select className="entrada" value={f.que} onChange={(e) => setF({ que: e.target.value })}>{QUE.map((x) => <option key={x.valor} value={x.valor}>{x.texto}</option>)}</select>
          </Campo>
          <Campo etiqueta="Quién">
            <select className="entrada" value={f.quien} onChange={(e) => setF({ quien: e.target.value })}><option value="">Todos</option>{(personas ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>
          </Campo>
          <Campo etiqueta="Qué hizo">
            <select className="entrada" value={f.accion} onChange={(e) => setF({ accion: e.target.value })}>
              <option value="">Cualquier cosa</option><option value="crear">Cargó</option><option value="editar">Editó</option><option value="anular">Anuló</option><option value="borrar">Dio de baja</option><option value="ajustar">Corrigió stock</option><option value="login">Entró al sistema</option>
            </select>
          </Campo>
          <label className="campo"><span>Desde</span><Entrada type="date" value={f.desde} onChange={(e) => setF({ desde: e.target.value })} /></label>
          <label className="campo"><span>Hasta</span><Entrada type="date" value={f.hasta} onChange={(e) => setF({ hasta: e.target.value })} /></label>
        </div>
        {hayFiltro && <button className="boton fantasma" style={{ justifySelf: 'start' }} onClick={() => setF({ que: '', quien: '', accion: '', desde: '', hasta: '', q: '' })}>Sacar los filtros</button>}
      </div>
      {isLoading ? <Cargando /> : !eventos.length ? <div className="hoja vacio"><p>{hayFiltro ? 'No hay cambios con estos filtros.' : 'Todavía no hay cambios registrados.'}</p></div> : (
        <div className="hoja filas">
          {eventos.map((e) => {
            const enlace = e.entidadId && e.accion !== 'login' ? ENLACE[e.entidad]?.(e.entidadId) : undefined;
            const que = ENTIDAD[e.entidad] ?? e.entidad;
            return (
              <div className="fila" key={e.id}>
                <div>
                  <div>
                    <b>{e.usuario ?? 'Sistema'}</b> {ACCION[e.accion] ?? e.accion}{e.accion !== 'login' && ' '}
                    {e.accion !== 'login' && (enlace ? <Link to={enlace}>{que}</Link> : que)}
                  </div>
                  {e.motivo && <div className="chico tenue">Motivo: {e.motivo}</div>}
                </div>
                <span className="chico tenue">{verMomento(e.fecha)}</span>
              </div>
            );
          })}
        </div>
      )}
      {hasNextPage && <button className="boton secundario" disabled={isFetchingNextPage} onClick={() => fetchNextPage()}>Ver anteriores</button>}
    </div>
  );
}
