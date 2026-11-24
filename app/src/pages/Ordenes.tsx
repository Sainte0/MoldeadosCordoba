import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Plus, Printer, ScanLine, Trash2, Truck } from 'lucide-react';
import { ALTOS_PALET, CONDICIONES, formatPesos, IVA_CUENTA1, LABEL_CONDICION, LABEL_VEHICULO, verCondicion, type Condicion, type Vehiculo } from '@moldeados/shared/base';
import { api, nroTicket, useSesion, verFecha, verMomento } from '../api';
import { useFiltros } from '../filtros';
import { useChoferes, useClientes, useEmpresa, useVariantes } from '../datos';
import { Muestra } from '../MapleVista';
import { Aviso, Cabecera, Campo, Cargando, Dialogo, Entrada, Opciones, Volver } from '../ui';
import { useStockPallets } from './Plastificar';

// Orden de venta (pedido N° 01, punto 3): el gerente la emite desde la compu, queda abierta en la pantalla de carga,
// el mulero escanea cada pallet con la pistola y con el último se cierra sola, se registra la venta y se imprime.

interface OrdenFila { id: string; numero: number; fecha: string; estado: string; condicionPago: Condicion; cliente: string; chofer: string | null; patente: string | null; pedidos: number; cargados: number; detalle: string }
interface Orden {
  id: string; numero: number; fecha: string; estado: 'abierta' | 'cerrada' | 'cancelada'; condicionPago: Condicion; porcentajeCuenta1: number | null; notas: string | null; motivo: string | null;
  creadaAt: string; cerradaAt: string | null; clienteId: string; cliente: string; cuit: string | null; chofer: string | null; dni: string | null; patente: string | null; vehiculo: Vehiculo | null;
  items: { id: string; varianteId: string; codigo: string; nombre: string; colorHex: string | null; maplesPorPaquete: number; alto: number; cantidad: number; precioMaple: number; cargados: number }[];
  palets: { id: string; numero: number; codigo: string; alto: number; paquetes: number; maplesPorPaquete: number; itemId: string; escaneadoAt: string }[];
  ventas: { id: string; numero: number; cuenta1: boolean; total: number; anuladoAt: string | null }[];
}

export function Ordenes() {
  const { puede } = useSesion();
  const [f, setF] = useFiltros({ estado: 'abierta' });
  const { data, isLoading } = useQuery({ queryKey: ['ordenes', f.estado], queryFn: () => api<OrdenFila[]>(`/ordenes?estado=${f.estado}`), refetchInterval: f.estado === 'abierta' ? 5000 : false });
  return (
    <div className="ancho" style={{ display: 'grid', gap: 16 }}>
      <Cabecera titulo="Órdenes de venta" bajada="El gerente la emite; en la zona de carga se escanea cada pallet al subirlo al camión.">
        {puede('ventas', 3) && <Link to="/ordenes/nueva" className="boton primario"><Plus size={18} aria-hidden /> Nueva orden</Link>}
      </Cabecera>
      <div className="pestanas" role="group" aria-label="Estado">
        {([['abierta', 'Para cargar'], ['cerrada', 'Cerradas'], ['cancelada', 'Canceladas']] as const).map(([v, t]) => <button key={v} aria-pressed={f.estado === v} onClick={() => setF({ estado: v })}>{t}</button>)}
      </div>
      {isLoading ? <Cargando /> : !data?.length ? <div className="hoja vacio"><p>{f.estado === 'abierta' ? 'No hay órdenes para cargar.' : 'No hay órdenes acá.'}</p></div> : (
        <div className="hoja filas">
          {data.map((o) => (
            <Link key={o.id} to={`/ordenes/${o.numero}`} className="fila">
              <div>
                <div className="principal">{o.cliente} · {o.detalle}</div>
                <div className="chico tenue">Orden {nroTicket(o.numero)} · {verFecha(o.fecha)}{o.chofer ? ` · ${o.chofer}` : ''}{o.patente ? ` (${o.patente})` : ''} · {LABEL_CONDICION[o.condicionPago]}</div>
              </div>
              <div className="derecha"><div className="cifra">{o.cargados} de {o.pedidos}</div>{o.estado === 'abierta' && <span className="chico tenue">pallets</span>}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

interface Renglon { varianteId: string; alto: number; cantidad: string }

export function NuevaOrden() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: clientes } = useClientes();
  const { data: variantes } = useVariantes();
  const { data: stock } = useStockPallets();
  const [clienteId, setClienteId] = useState('');
  const cliente = clientes?.find((c) => c.id === clienteId);
  const { data: choferes } = useChoferes(clienteId);
  const { data: precios } = useQuery({ queryKey: ['precios-cliente', clienteId], queryFn: () => api<Record<string, number>>(`/precios/cliente/${clienteId}`), enabled: !!clienteId });
  const [choferId, setChoferId] = useState('');
  const [condicion, setCondicion] = useState<{ c: Condicion; pct: string } | null>(null);
  const [renglones, setRenglones] = useState<Renglon[]>([{ varianteId: '', alto: 7, cantidad: '' }]);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  // La condición de pago la trae la ficha del cliente; el gerente la puede cambiar para esta orden.
  useEffect(() => { if (cliente) setCondicion({ c: cliente.condicionPago, pct: String(cliente.porcentajeCuenta1 ?? '') }); setChoferId(''); }, [cliente?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const activas = (variantes ?? []).filter((v) => v.activo);
  const enStock = (varianteId: string, alto: number) => stock?.find((s) => s.varianteId === varianteId && s.alto === alto);
  const total = renglones.reduce((n, r) => {
    const v = activas.find((x) => x.id === r.varianteId);
    return n + (v ? (Number(r.cantidad) || 0) * 6 * r.alto * v.maplesPorPaquete * (precios?.[v.id] ?? 0) : 0);
  }, 0);
  const pct = condicion?.c === 'mixta' ? Number(condicion.pct) || 0 : condicion?.c === 'cuenta1' ? 100 : 0;
  const cambiar = (i: number, r: Partial<Renglon>) => setRenglones(renglones.map((x, j) => (j === i ? { ...x, ...r } : x)));

  const emitir = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cliente || !condicion) return setError('Elegí el cliente');
    setError(null); setGuardando(true);
    try {
      const o = await api<{ numero: number }>('/ordenes', { method: 'POST', body: {
        clienteId, choferId: choferId || null, condicionPago: condicion.c, porcentajeCuenta1: condicion.c === 'mixta' ? Number(condicion.pct) || null : null,
        items: renglones.filter((r) => r.varianteId).map((r) => ({ varianteId: r.varianteId, alto: r.alto, cantidad: Number(r.cantidad) || 0 })),
      } });
      await qc.invalidateQueries({ queryKey: ['ordenes'] });
      nav(`/ordenes/${o.numero}`, { replace: true });
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo emitir la orden'); }
    setGuardando(false);
  };

  return (
    <form className="columna" style={{ display: 'grid', gap: 18 }} onSubmit={emitir}>
      <Volver a="/ordenes" texto="Órdenes" />
      <Cabecera titulo="Nueva orden de venta" bajada="Queda abierta en la pantalla de carga hasta que se escanee el último pallet." />
      <div className="hoja relleno" style={{ display: 'grid', gap: 14 }}>
        <Campo etiqueta="Cliente">
          <select className="entrada" value={clienteId} onChange={(e) => setClienteId(e.target.value)} required autoFocus>
            <option value="">Elegí el cliente</option>
            {(clientes ?? []).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </Campo>
        {cliente && (
          <Campo etiqueta="Chofer" ayuda={choferes?.some((c) => c.delCliente) ? 'Primero, los que cargan para este cliente.' : 'Se cargan en Ventas › Choferes.'}>
            <select className="entrada" value={choferId} onChange={(e) => setChoferId(e.target.value)}>
              <option value="">Sin chofer</option>
              {(choferes ?? []).map((c) => <option key={c.id} value={c.id}>{c.apellido}, {c.nombre}{c.patente ? ` · ${c.patente}` : ''}{c.vehiculo ? ` · ${LABEL_VEHICULO[c.vehiculo]}` : ''}{c.delCliente ? '' : ' (otro cliente)'}</option>)}
            </select>
          </Campo>
        )}
      </div>

      {cliente && (
        <section className="hoja relleno" style={{ display: 'grid', gap: 12 }}>
          <h3>Qué se lleva</h3>
          {renglones.map((r, i) => {
            const v = activas.find((x) => x.id === r.varianteId);
            const s = v ? enStock(v.id, r.alto) : undefined;
            return (
              <div key={i} className="renglon-orden">
                <select className="entrada" value={r.varianteId} onChange={(e) => cambiar(i, { varianteId: e.target.value })} aria-label="Maple" required>
                  <option value="">Maple</option>
                  {activas.map((x) => <option key={x.id} value={x.id}>{x.codigo}</option>)}
                </select>
                <select className="entrada" value={r.alto} onChange={(e) => cambiar(i, { alto: Number(e.target.value) })} aria-label="Alto">
                  {ALTOS_PALET.map((a) => <option key={a} value={a}>de {a}</option>)}
                </select>
                <Entrada inputMode="numeric" value={r.cantidad} onChange={(e) => cambiar(i, { cantidad: e.target.value.replace(/\D/g, '') })} placeholder="Pallets" aria-label="Cantidad de pallets" required />
                {renglones.length > 1 && <button type="button" className="boton icono" aria-label="Quitar renglón" onClick={() => setRenglones(renglones.filter((_, j) => j !== i))}><Trash2 size={18} /></button>}
                {v && <p className="chico tenue renglon-dato">{precios?.[v.id] ? `${formatPesos(precios[v.id]!)} el maple` : 'Sin precio: cargalo en la ficha del cliente'} · en la fábrica: {s ? `${s.pallets - s.enCarga} de ${r.alto}` : `ninguno de ${r.alto}`}</p>}
              </div>
            );
          })}
          <button type="button" className="boton secundario" style={{ justifySelf: 'start' }} onClick={() => setRenglones([...renglones, { varianteId: '', alto: 7, cantidad: '' }])}><Plus size={18} aria-hidden /> Otro renglón</button>
        </section>
      )}

      {cliente && condicion && (
        <section className="hoja relleno" style={{ display: 'grid', gap: 12 }}>
          <h3>Condición de pago</h3>
          <p className="chico tenue">La de la ficha de {cliente.nombre}: {verCondicion(cliente.condicionPago, cliente.porcentajeCuenta1)}. Se puede cambiar solo para esta orden.</p>
          <Opciones columnas valor={condicion.c} onChange={(c) => setCondicion({ ...condicion, c })} opciones={CONDICIONES.map((c) => ({ valor: c, titulo: LABEL_CONDICION[c] }))} />
          {condicion.c === 'mixta' && (
            <Campo etiqueta="Porcentaje a Cuenta 1" ayuda={`El resto (${100 - (Number(condicion.pct) || 0)}%) va a Cuenta 2.`}>
              <Entrada inputMode="numeric" unidad="%" value={condicion.pct} onChange={(e) => setCondicion({ ...condicion, pct: e.target.value.replace(/\D/g, '').slice(0, 2) })} required />
            </Campo>
          )}
          {total > 0 && <p>Total aproximado si se carga todo: <b>{formatPesos(Math.round(total * (1 + (pct / 100) * (IVA_CUENTA1 / 10000))))}</b> <span className="chico tenue">(Cuenta 1 con IVA)</span></p>}
        </section>
      )}

      <Aviso>{error}</Aviso>
      <div className="acciones">
        <Link to="/ordenes" className="boton secundario">Cancelar</Link>
        <button className="boton primario" disabled={!cliente || guardando}><Truck size={18} aria-hidden /> {guardando ? 'Emitiendo…' : 'Emitir orden'}</button>
      </div>
    </form>
  );
}

// ---------- Pantalla de carga ----------

let audio: AudioContext | null = null;
/** OK: un pitido agudo corto. Error: dos graves. Sin archivos de sonido. */
function sonar(ok: boolean) {
  try {
    audio ??= new AudioContext();
    const t = audio.currentTime;
    for (const [i, f] of (ok ? [[0, 1320]] : [[0, 220], [0.22, 180]]) as [number, number][]) {
      const o = audio.createOscillator(); const g = audio.createGain();
      o.type = ok ? 'sine' : 'square'; o.frequency.value = f;
      g.gain.setValueAtTime(0.25, t + i); g.gain.exponentialRampToValueAtTime(0.001, t + i + (ok ? 0.15 : 0.2));
      o.connect(g).connect(audio.destination); o.start(t + i); o.stop(t + i + 0.22);
    }
  } catch { /* sin audio: queda el aviso en pantalla */ }
}

export function OrdenCarga() {
  const { id } = useParams();
  const { puede } = useSesion();
  const qc = useQueryClient();
  const { data: o, isLoading, error } = useQuery({ queryKey: ['orden', id], queryFn: () => api<Orden>(`/ordenes/${id}`), refetchInterval: (q) => (q.state.data?.estado === 'abierta' ? 4000 : false) });
  const [codigo, setCodigo] = useState('');
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);
  const [dialogo, setDialogo] = useState<'cerrar' | 'cancelar' | null>(null);
  const [motivo, setMotivo] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [imprimir, setImprimir] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const abierta = o?.estado === 'abierta';

  // La pistola "tipea" el QR y un Enter: el campo tiene que tener el foco siempre.
  useEffect(() => {
    if (!abierta || dialogo) return;
    const t = setInterval(() => { if (document.activeElement !== entrada.current && !document.querySelector('.dialogo')) entrada.current?.focus(); }, 800);
    return () => clearInterval(t);
  }, [abierta, dialogo]);
  useEffect(() => { if (imprimir && o?.estado === 'cerrada') { setImprimir(false); setTimeout(() => window.print(), 300); } }, [imprimir, o?.estado]);

  if (isLoading) return <Cargando />;
  if (!o) return <Aviso>{error instanceof Error ? error.message : 'No encontramos esa orden'}</Aviso>;

  const escanear = async (e: React.FormEvent) => {
    e.preventDefault();
    const c = codigo.trim();
    setCodigo('');
    if (!c) return;
    try {
      const r = await api<{ palet: string; codigo: string; alto: number; completa: boolean }>(`/ordenes/${o.id}/escanear`, { method: 'POST', body: { codigo: c } });
      sonar(true);
      setResultado({ ok: true, texto: r.completa ? `Pallet ${r.palet} OK. Orden completa: se cerró y se imprime.` : `Pallet ${r.palet} OK · ${r.codigo} de ${r.alto}` });
      if (r.completa) setImprimir(true);
    } catch (er) {
      sonar(false);
      setResultado({ ok: false, texto: er instanceof Error ? er.message : 'No se pudo leer' });
    }
    await qc.invalidateQueries({ queryKey: ['orden', id] });
    void qc.invalidateQueries({ queryKey: ['stock-palets'] });
  };
  const accion = async () => {
    setErr(null);
    try {
      await api(`/ordenes/${o.id}/${dialogo === 'cerrar' ? 'cerrar' : 'cancelar'}`, { method: 'POST', body: { motivo: motivo.trim() || undefined } });
      if (dialogo === 'cerrar') setImprimir(true);
      setDialogo(null); setMotivo('');
      await qc.invalidateQueries();
    } catch (er) { setErr(er instanceof Error ? er.message : 'No se pudo'); }
  };
  const cargados = o.palets.length;
  const pedidos = o.items.reduce((n, i) => n + i.cantidad, 0);

  return (
    <div className="ancho carga" style={{ display: 'grid', gap: 18 }}>
      <div className="no-imprimir" style={{ display: 'grid', gap: 18 }}>
        <Volver a="/ordenes" texto="Órdenes" />
        <Cabecera titulo={`${o.cliente}`} bajada={`Orden ${nroTicket(o.numero)} · ${o.chofer ? `${o.chofer}${o.patente ? ` (${o.patente})` : ''}` : 'sin chofer'} · ${verCondicion(o.condicionPago, o.porcentajeCuenta1)}`}>
          <div className="acciones-titulo">
            {o.estado === 'cerrada' && <button className="boton primario" onClick={() => window.print()}><Printer size={18} aria-hidden /> Imprimir orden</button>}
            {abierta && puede('ventas', 3) && <button className="boton secundario" onClick={() => setDialogo('cerrar')} disabled={!cargados}>Cerrar con lo cargado</button>}
            {abierta && puede('ventas', 3) && <button className="boton fantasma" onClick={() => setDialogo('cancelar')}><Ban size={18} aria-hidden /> Cancelar orden</button>}
          </div>
        </Cabecera>

        {o.estado !== 'abierta' && <Aviso ok={o.estado === 'cerrada'}>{o.estado === 'cerrada' ? `Cerrada ${o.cerradaAt ? verMomento(o.cerradaAt) : ''}: ${cargados} de ${pedidos} pallets.` : 'Orden cancelada.'}{o.motivo ? ` ${o.motivo}.` : ''}</Aviso>}

        <div className="contadores">
          {o.items.map((i) => (
            <div key={i.id} className={`renglon-carga${i.cargados >= i.cantidad ? ' completo' : ''}`}>
              <div className="con-muestra"><Muestra color={i.colorHex} grande /> <b>{i.codigo} de {i.alto}</b></div>
              <div className="carga-cifra">{i.cargados} <small>de {i.cantidad}</small></div>
            </div>
          ))}
        </div>

        {abierta && (
          <form onSubmit={escanear} className="hoja relleno escaneo">
            <label htmlFor="escaneo" className="con-muestra"><ScanLine size={22} aria-hidden /> <b>Escaneá cada pallet al subirlo</b></label>
            <input id="escaneo" ref={entrada} className="entrada enorme" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Escaneá o escribí el n.º" autoComplete="off" autoFocus />
          </form>
        )}
        {resultado && <div className={`resultado-escaneo ${resultado.ok ? 'ok' : 'mal'}`} role="status" aria-live="assertive">{resultado.texto}</div>}

        {o.palets.length > 0 && (
          <section className="hoja">
            <div className="fila"><h3>Cargados ({cargados})</h3></div>
            {[...o.palets].reverse().map((p) => (
              <Link key={p.id} to={`/palets/${p.numero}`} className="fila">
                <div><div className="principal">Pallet {nroTicket(p.numero)} · {p.codigo} de {p.alto}</div><div className="chico tenue">{verMomento(p.escaneadoAt)}</div></div>
                <span className="cifra">{(p.paquetes * p.maplesPorPaquete).toLocaleString('es-AR')} maples</span>
              </Link>
            ))}
          </section>
        )}
        {o.ventas.length > 0 && (
          <section className="hoja">
            <div className="fila"><h3>Venta registrada</h3></div>
            {o.ventas.map((v) => (
              <Link key={v.id} to={`/ventas/${v.numero}`} className={`fila${v.anuladoAt ? ' anulada' : ''}`}>
                <div className="principal">{v.cuenta1 ? 'Cuenta 1' : 'Cuenta 2'} · remito {nroTicket(v.numero)}</div>
                <span className="cifra">{formatPesos(v.total)}</span>
              </Link>
            ))}
          </section>
        )}
      </div>

      {o.estado === 'cerrada' && <ImpresionOrden o={o} />}

      {dialogo && (
        <Dialogo titulo={dialogo === 'cerrar' ? `Cerrar con ${cargados} de ${pedidos} pallets` : 'Cancelar la orden'} onCerrar={() => setDialogo(null)}>
          <p className="tenue">{dialogo === 'cerrar' ? 'Se descuentan del stock los pallets cargados, se registra la venta por lo cargado y se imprime la orden por duplicado.' : 'El camión no se lleva nada. Si había pallets escaneados, vuelven al stock.'}</p>
          <Campo etiqueta="Motivo"><Entrada value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={dialogo === 'cerrar' ? 'Ej.: no entraron en el camión' : 'Ej.: no vino el camión'} autoFocus /></Campo>
          <Aviso>{err}</Aviso>
          <div className="acciones">
            <button className="boton secundario" onClick={() => setDialogo(null)}>Volver</button>
            <button className={`boton ${dialogo === 'cerrar' ? 'primario' : 'peligro'}`} disabled={dialogo === 'cancelar' && motivo.trim().length < 3} onClick={accion}>{dialogo === 'cerrar' ? 'Cerrar e imprimir' : 'Cancelar orden'}</button>
          </div>
        </Dialogo>
      )}
    </div>
  );
}

/** La orden impresa por duplicado: original para el chofer (la firma) y duplicado para la fábrica. */
function ImpresionOrden({ o }: { o: Orden }) {
  const { data: empresa } = useEmpresa();
  const maples = o.palets.reduce((n, p) => n + p.paquetes * p.maplesPorPaquete, 0);
  const copia = (titulo: string) => (
    <section className="orden-impresa" key={titulo}>
      <header>
        <img src="/logo.webp" width={40} height={40} alt="" />
        <div style={{ flex: 1 }}><b>{empresa?.razonSocial ?? 'Moldeados Córdoba'}</b><div>{[empresa?.cuit && `CUIT ${empresa.cuit}`, empresa?.direccion].filter(Boolean).join(' · ')}</div></div>
        <div style={{ textAlign: 'right' }}><b>Orden {nroTicket(o.numero)}</b><div>{titulo}</div></div>
      </header>
      <p>Fecha y hora: <b>{verMomento(o.cerradaAt ?? o.creadaAt)}</b></p>
      <p>Cliente: <b>{o.cliente}</b>{o.cuit ? ` · CUIT ${o.cuit}` : ''}</p>
      <p>Chofer: <b>{o.chofer ?? '—'}</b>{o.dni ? ` · DNI ${o.dni}` : ''}{o.patente ? ` · Patente ${o.patente}` : ''}{o.vehiculo ? ` · ${LABEL_VEHICULO[o.vehiculo]}` : ''}</p>
      <table>
        <thead><tr><th>Pallet</th><th>Tipo</th><th>Alto</th><th style={{ textAlign: 'right' }}>Maples</th></tr></thead>
        <tbody>{o.palets.map((p) => <tr key={p.id}><td>{nroTicket(p.numero)}</td><td>{p.codigo}</td><td>{p.alto}</td><td style={{ textAlign: 'right' }}>{(p.paquetes * p.maplesPorPaquete).toLocaleString('es-AR')}</td></tr>)}</tbody>
        <tfoot><tr><td colSpan={3}><b>{o.palets.length} pallets</b></td><td style={{ textAlign: 'right' }}><b>{maples.toLocaleString('es-AR')} maples</b></td></tr></tfoot>
      </table>
      <div className="firma"><div>Firma del chofer</div><div>Aclaración</div></div>
    </section>
  );
  return <div className="impresion">{copia('Original · chofer')}{copia('Duplicado · fábrica')}</div>;
}
