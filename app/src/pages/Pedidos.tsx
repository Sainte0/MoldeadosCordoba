import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Ban, CheckCircle2, Plus, RotateCcw, Trash2, Truck } from 'lucide-react';
import { LABEL_VEHICULO, PALET_DEFAULT, VEHICULOS, type Vehiculo } from '@moldeados/shared/base';
import { api, hoy, nroTicket, useSesion, verFecha } from '../api';
import { useStockMaples, type Cliente } from '../datos';
import { useDemorado, useFiltros, useUrlConNumero } from '../filtros';
import { Muestra } from '../MapleVista';
import { Asistente, Aviso, Buscador, Cabecera, Campo, Cargando, Dialogo, Entrada, EntradaNumero, Opciones, type Paso } from '../ui';
import { ElegirCliente, asegurarCliente } from './ElegirCliente';

interface PedidoFila { id: string; numero: number; estado: 'abierto' | 'entregado' | 'cancelado'; fechaEntrega: string | null; vehiculo: Vehiculo | null; clienteId: string; cliente: string; paquetes: number; despachado: number; resumen: string }
export interface PedidoDetalle extends Omit<PedidoFila, 'paquetes' | 'despachado' | 'resumen'> {
  notas: string | null; cargadoAt: string; cargadoPor: string;
  items: { varianteId: string; codigo: string; nombre: string; colorHex: string | null; maplesPorPaquete: number; paquetes: number; despachado: number }[];
  ventas: { id: string; numero: number; fecha: string; retira: string | null; total: number; anuladoAt: string | null }[];
}

const ESTADO = { abierto: 'Por entregar', entregado: 'Entregado', cancelado: 'Cancelado' } as const;
const vencido = (f: string | null) => !!f && f < hoy();

export function Pedidos() {
  const { puede } = useSesion();
  const [f, setF] = useFiltros({ estado: 'abierto', q: '' });
  const q = useDemorado(f.q);
  const { data, isLoading } = useQuery({ queryKey: ['pedidos', f.estado, q], queryFn: () => api<PedidoFila[]>(`/pedidos?estado=${f.estado}&q=${encodeURIComponent(q)}`) });
  return (
    <div className="ancho" style={{ display: 'grid', gap: 16 }}>
      <Cabecera titulo="Pedidos" bajada="Lo que encargan los clientes y para cuándo. Se cierran solos cuando se despacha todo.">
        {puede('ventas', 2) && <Link to="/pedidos/nuevo" className="boton primario"><Plus size={18} aria-hidden /> Nuevo pedido</Link>}
      </Cabecera>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="pestanas" role="group" aria-label="Estado">
          {([['abierto', 'Por entregar'], ['entregado', 'Entregados'], ['cancelado', 'Cancelados'], ['todos', 'Todos']] as const).map(([v, t]) => (
            <button key={v} aria-pressed={f.estado === v} onClick={() => setF({ estado: v })}>{t}</button>
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 220 }}><Buscador placeholder="Buscar cliente o n.º de pedido" value={f.q} onChange={(e) => setF({ q: e.target.value })} aria-label="Buscar pedidos" /></div>
      </div>
      {isLoading ? <Cargando /> : !data?.length ? <div className="hoja vacio"><p>{f.estado === 'abierto' ? 'No hay pedidos por entregar.' : 'No hay pedidos con estos filtros.'}</p></div> : (
        <div className="hoja filas">
          {data.map((p) => (
            <Link key={p.id} to={`/pedidos/${p.numero}`} className="fila">
              <div>
                <div className="principal">{p.cliente} <span className="tenue" style={{ fontWeight: 400 }}>· Pedido {nroTicket(p.numero)}</span></div>
                <div className="chico tenue">{p.resumen}{p.vehiculo ? ` · ${LABEL_VEHICULO[p.vehiculo]}` : ''}</div>
                {p.estado === 'abierto' && <div className="nivel" style={{ marginTop: 6, maxWidth: 260 }} aria-label={`${p.despachado} de ${p.paquetes} paquetes entregados`}><i style={{ width: `${Math.min(100, (p.despachado / p.paquetes) * 100)}%` }} /></div>}
              </div>
              <div className="derecha">
                {p.estado === 'abierto'
                  ? <><div className={vencido(p.fechaEntrega) ? 'saldo-mas' : ''} style={{ fontWeight: 600 }}>{p.fechaEntrega ? verFecha(p.fechaEntrega) : 'Sin fecha'}</div><div className="chico tenue">{p.despachado} de {p.paquetes} paq.</div></>
                  : <span className={`marca-texto ${p.estado === 'entregado' ? 'ok' : ''}`}>{ESTADO[p.estado]}</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function NuevoPedido() {
  const navegar = useNavigate();
  const qc = useQueryClient();
  const { data: stock } = useStockMaples();
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [items, setItems] = useState<{ varianteId: string; paquetes: number }[]>([]);
  const [form, setForm] = useState<{ varianteId: string | null; cantidad: string; en: 'palets' | 'paquetes' }>({ varianteId: null, cantidad: '', en: 'palets' });
  const [fechaEntrega, setFechaEntrega] = useState('');
  const [vehiculo, setVehiculo] = useState<Vehiculo | null>(null);
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const porPalet = PALET_DEFAULT.ancho * PALET_DEFAULT.largo * PALET_DEFAULT.alto;
  const variante = (id: string) => stock?.find((s) => s.id === id);
  const agregar = () => {
    const n = Number(form.cantidad);
    if (!form.varianteId || !n) return;
    const paquetes = form.en === 'palets' ? n * porPalet : n;
    setItems((x) => [...x.filter((i) => i.varianteId !== form.varianteId), { varianteId: form.varianteId!, paquetes: (x.find((i) => i.varianteId === form.varianteId)?.paquetes ?? 0) + paquetes }]);
    setForm({ varianteId: null, cantidad: '', en: form.en });
  };
  const lista = items.length > 0 && (
    <div className="hoja filas">
      {items.map((i) => {
        const v = variante(i.varianteId);
        const disponible = v ? v.producido - v.vendido - v.comprometido : 0;
        return (
          <div className="fila" key={i.varianteId} style={{ gridTemplateColumns: 'auto 1fr auto' }}>
            <Muestra color={v?.colorHex ?? null} />
            <div><div className="principal">{v?.codigo} · {i.paquetes} paquetes</div>
              <div className="chico tenue">{(i.paquetes * (v?.maplesPorPaquete ?? 60)).toLocaleString('es-AR')} maples · {disponible >= i.paquetes ? `hay stock (${disponible} paq. libres)` : `faltan producir ${i.paquetes - Math.max(0, disponible)} paq.`}</div></div>
            <button type="button" className="boton icono" aria-label={`Quitar ${v?.codigo}`} onClick={() => setItems(items.filter((x) => x.varianteId !== i.varianteId))}><Trash2 size={18} /></button>
          </div>
        );
      })}
    </div>
  );

  const pasos: Paso[] = [
    { titulo: '¿Quién pide?', ayuda: 'El cliente que hace el pedido. Si es nuevo, agregalo con el nombre.', contenido: <ElegirCliente valor={cliente} onChange={(c) => { setCliente(c); setVehiculo((v) => v ?? c.vehiculoHabitual); }} />, listo: cliente ? true : 'Elegí el cliente', rapido: true },
    {
      titulo: '¿Qué pide?',
      ayuda: `Elegí el maple y cuánto. Podés anotarlo en palets (de ${porPalet} paquetes) o en paquetes sueltos. Te avisamos si hay stock o falta producir.`,
      contenido: (
        <>
          {lista}
          <div className="hoja relleno" style={{ display: 'grid', gap: 12 }}>
            <Opciones columnas valor={form.varianteId} onChange={(varianteId) => setForm({ ...form, varianteId })} opciones={(stock ?? []).filter((s) => s.activo).map((s) => ({ valor: s.id, titulo: s.codigo, detalle: s.nombre }))} />
            {form.varianteId && (
              <>
                <div className="pestanas" role="group" aria-label="Unidad">
                  <button type="button" aria-pressed={form.en === 'palets'} onClick={() => setForm({ ...form, en: 'palets' })}>Palets</button>
                  <button type="button" aria-pressed={form.en === 'paquetes'} onClick={() => setForm({ ...form, en: 'paquetes' })}>Paquetes</button>
                </div>
                <EntradaNumero unidad={form.en === 'palets' ? 'palets' : 'paq.'} value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: e.target.value.replace(/\D/g, '') })} aria-label="Cantidad" autoFocus />
                <button type="button" className="boton secundario" onClick={agregar} disabled={!Number(form.cantidad)}><Plus size={18} aria-hidden /> Agregar al pedido</button>
              </>
            )}
          </div>
        </>
      ),
      listo: items.length ? true : 'Agregá al menos un maple',
    },
    {
      titulo: '¿Para cuándo?',
      ayuda: 'La fecha en que lo retira o se le entrega, y en qué vehículo (para armar los palets a la altura justa).',
      contenido: (
        <>
          <Campo etiqueta="Fecha de entrega" ayuda={fechaEntrega ? verFecha(fechaEntrega) : 'Opcional'}><Entrada type="date" value={fechaEntrega} min={hoy()} onChange={(e) => setFechaEntrega(e.target.value)} /></Campo>
          <Campo etiqueta="Vehículo"><Opciones columnas valor={vehiculo} onChange={setVehiculo} opciones={VEHICULOS.map((v) => ({ valor: v, titulo: LABEL_VEHICULO[v] }))} /></Campo>
          <Campo etiqueta="Observaciones" ayuda="Opcional"><textarea className="entrada" value={notas} onChange={(e) => setNotas(e.target.value)} /></Campo>
        </>
      ),
      listo: true,
    },
    { titulo: 'Revisá y guardá', ayuda: 'Al guardar, el pedido aparece en Inicio y en Ventas › Pedidos hasta que se entregue todo.', contenido: <><p><b>{cliente?.nombre}</b>{fechaEntrega ? ` · para el ${verFecha(fechaEntrega)}` : ''}{vehiculo ? ` · ${LABEL_VEHICULO[vehiculo]}` : ''}</p>{lista}</>, listo: true },
  ];

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      const cli = await asegurarCliente(cliente!);
      setCliente(cli);
      const r = await api<{ id: string }>('/pedidos', { method: 'POST', body: { clienteId: cli.id, fechaEntrega: fechaEntrega || null, vehiculo, notas: notas || undefined, items } });
      await qc.invalidateQueries();
      navegar(`/pedidos/${r.id}?nuevo=1`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
      setGuardando(false);
    }
  };
  return <Asistente proceso="pedido" pasos={pasos} onTerminar={guardar} textoTerminar="Guardar pedido" guardando={guardando} error={error} onCancelar={() => navegar('/pedidos')} />;
}

export function PedidoDetalleVista() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { puede } = useSesion();
  const qc = useQueryClient();
  const { data: p, isLoading } = useQuery({ queryKey: ['pedido', id], queryFn: () => api<PedidoDetalle>(`/pedidos/${id}`) });
  useUrlConNumero('/pedidos', id, p?.numero);
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState('');
  if (isLoading || !p) return <Cargando />;
  const estado = async (cancelar: boolean) => {
    await api(`/pedidos/${p.id}/estado`, { method: 'POST', body: { cancelar, motivo: motivo || undefined } });
    await qc.invalidateQueries();
    setCancelando(false);
  };
  return (
    <div className="columna" style={{ display: 'grid', gap: 20 }}>
      <Link to="/pedidos" className="boton fantasma" style={{ justifySelf: 'start' }}><ArrowLeft size={18} aria-hidden /> Pedidos</Link>
      {params.get('nuevo') && <div className="aviso ok" style={{ display: 'flex', gap: 10, alignItems: 'center' }}><CheckCircle2 size={22} aria-hidden /> Pedido guardado.</div>}
      <header>
        <h1>{p.cliente}</h1>
        <p className="tenue" style={{ marginTop: 6 }}>Pedido {nroTicket(p.numero)} · {ESTADO[p.estado]}{p.fechaEntrega ? ` · para el ${verFecha(p.fechaEntrega)}` : ''}{p.vehiculo ? ` · ${LABEL_VEHICULO[p.vehiculo]}` : ''}</p>
      </header>
      <section className="hoja">
        {p.items.map((i) => (
          <div className="fila" key={i.varianteId}>
            <span className="con-muestra"><Muestra color={i.colorHex} /><span><span className="principal">{i.codigo}</span><br /><span className="chico tenue">{(i.paquetes * i.maplesPorPaquete).toLocaleString('es-AR')} maples</span></span></span>
            <span className="derecha"><span className="cifra">{i.despachado} / {i.paquetes}</span><br /><span className="chico tenue">paquetes entregados</span></span>
            <div className="nivel"><i style={{ width: `${Math.min(100, (i.despachado / i.paquetes) * 100)}%` }} /></div>
          </div>
        ))}
      </section>
      {p.notas && <p><b>Notas:</b> {p.notas}</p>}
      {p.ventas.length > 0 && (
        <section className="hoja">
          <div className="fila"><h3>Despachos</h3></div>
          {p.ventas.map((v) => <Link key={v.id} to={`/ventas/${v.numero}`} className={`fila${v.anuladoAt ? ' anulada' : ''}`}><span>Remito {nroTicket(v.numero)} · {verFecha(v.fecha)}{v.retira ? ` · retiró ${v.retira}` : ''}</span><span className="chico tenue">Ver</span></Link>)}
        </section>
      )}
      <p className="chico tenue">Registrado por {p.cargadoPor}</p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {p.estado === 'abierto' && puede('ventas', 2) && <Link to={`/ventas/nueva?pedido=${p.id}`} className="boton primario grande"><Truck size={20} aria-hidden /> Despachar</Link>}
        {p.estado === 'abierto' && puede('ventas', 2) && <button className="boton secundario" onClick={() => setCancelando(true)}><Ban size={18} aria-hidden /> Cancelar pedido</button>}
        {p.estado === 'cancelado' && puede('ventas', 2) && <button className="boton secundario" onClick={() => estado(false)}><RotateCcw size={18} aria-hidden /> Reabrir</button>}
      </div>
      {cancelando && (
        <Dialogo titulo={`Cancelar pedido ${nroTicket(p.numero)}`} onCerrar={() => setCancelando(false)}>
          <p className="tenue">Lo ya despachado queda como está. El pedido deja de aparecer como pendiente.</p>
          <Campo etiqueta="Motivo" ayuda="Opcional"><textarea className="entrada" value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Campo>
          <Aviso>{null}</Aviso>
          <div className="acciones"><button className="boton secundario" onClick={() => setCancelando(false)}>Volver</button><button className="boton peligro" onClick={() => estado(true)}>Cancelar pedido</button></div>
        </Dialogo>
      )}
    </div>
  );
}
