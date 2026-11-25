import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { ArrowLeft, Ban, CheckCircle2, Printer, Truck } from 'lucide-react';
import { COLOR_CARTON, formatCantidad, LABEL_TURNO, LABEL_VEHICULO, type Turno, type Unidad, type Vehiculo } from '@moldeados/shared/base';
import { api, nroTicket, useSesion, verFecha, verMomento } from '../api';
import { useUrlConNumero } from '../filtros';
import { useEmpresa } from '../datos';
import { MapleVista, Muestra } from '../MapleVista';
import { Aviso, Campo, Cargando, Dialogo, Volver } from '../ui';
import { Estado } from '../Estado';

interface Traza {
  id: string; numero: number; ancho: number; largo: number; alto: number; paquetes: number; vehiculo: Vehiculo | null; destino: string | null; notas: string | null;
  armadoAt: string; armadoPor: string; anuladoAt: string | null; motivoAnulacion: string | null; anuladoPor: string | null;
  codigo: string; variante: string; colorHex: string | null; tamano: 'chico' | 'grande'; maplesPorPaquete: number;
  lotes: { id: string; numero: number; fecha: string; turno: Turno; maquina: string; paquetes: number; personal: string | null }[] | null;
  venta: { id: string; numero: number; fecha: string; retira: string | null; vehiculo: Vehiculo | null; patente: string | null; cliente: string } | null;
  puedeDespachar: boolean;
  origen: { id: string; nombre: string; unidad: Unidad; real: number; compras: { id: string; numero: number; fecha: string; tipo: string; proveedor: string; cantidad: number }[] }[] | null;
}

/** Etiqueta para pegar en el palet + todo lo que se sabe de él. Es la página que abre el QR. */
export function PaletDetalle() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { puede } = useSesion();
  const qc = useQueryClient();
  const { data: p, isLoading, error } = useQuery({ queryKey: ['palet', id], queryFn: () => api<Traza>(`/palets/${id}`) });
  useUrlConNumero('/palets', id, p?.numero);
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [err, setErr] = useState<string | null>(null);

  if (isLoading) return <Cargando />;
  if (!p) return <Aviso>{error instanceof Error ? error.message : 'No encontramos ese pallet'}</Aviso>;
  const fechas = p.lotes?.map((l) => l.fecha).sort() ?? [];

  const anular = async () => {
    setErr(null);
    try {
      await api(`/palets/${p.id}/anular`, { method: 'POST', body: { motivo } });
      await qc.invalidateQueries();
      setAnulando(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo anular');
    }
  };

  const vendido = !!p.venta;
  const recien = !!params.get('nuevo') && !p.anuladoAt;
  const maples = p.paquetes * p.maplesPorPaquete;

  const etiqueta = <EtiquetaPalet p={{ ...p, producido: fechas }} />;

  // Orden por uso: qué palet es y en qué estado (lo que se busca al escanearlo), qué se puede hacer, de dónde salió,
  // y la etiqueta al final. Recién armado es al revés: lo primero es imprimir la etiqueta.
  return (
    <div className="columna solo-etiqueta detalle-palet" style={{ display: 'grid', gap: 20 }}>
      {/* Tamaño de hoja solo para esta página: el ticket y el remito imprimen en A4. */}
      <style>{'@media print { @page { size: 100mm 150mm; margin: 4mm; } }'}</style>
      <Volver a="/palets" texto="Stock de pallets" />
      {recien && <div className="aviso ok" style={{ display: 'flex', gap: 10, alignItems: 'center' }}><CheckCircle2 size={22} aria-hidden /> Pallet cargado al stock. Imprimí la etiqueta y pegala en el film.</div>}
      {p.anuladoAt && <Aviso>Pallet anulado por {p.anuladoPor}, {verMomento(p.anuladoAt)}: {p.motivoAnulacion}</Aviso>}

      <header className="cabeza-detalle">
        <Muestra color={p.colorHex} grande />
        <div>
          <h1>Pallet {nroTicket(p.numero)}</h1>
          <p className="tenue">{p.codigo} · {p.variante} · {maples.toLocaleString('es-AR')} maples ({p.paquetes} paq. × {p.maplesPorPaquete})</p>
        </div>
        {p.anuladoAt ? <Estado nivel="critico">Anulado</Estado> : vendido ? <span className="marca-texto">Vendido</span> : <Estado nivel="ok">Listo para salir</Estado>}
      </header>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button className={`boton ${recien || (!vendido && !p.anuladoAt && !p.puedeDespachar) ? 'primario grande' : 'secundario'}`} onClick={() => window.print()}><Printer size={20} aria-hidden /> Imprimir etiqueta</button>
      </div>

      {recien && <><MapleVista color={p.colorHex} alto={160} />{etiqueta}</>}

      {p.venta && (
        <section className="hoja relleno" style={{ display: 'grid', gap: 8 }}>
          <h3>Vendido</h3>
          <p>A <b>{p.venta.cliente}</b> el {verFecha(p.venta.fecha)}. Lo retiró {p.venta.retira}{p.venta.vehiculo ? ` en ${LABEL_VEHICULO[p.venta.vehiculo].toLowerCase()}` : ''}{p.venta.patente ? ` (${p.venta.patente})` : ''}.</p>
          {puede('ventas') && <Link to={`/ventas/${p.venta.numero}`}>Ver remito {nroTicket(p.venta.numero)}</Link>}
        </section>
      )}

      {!!p.lotes?.length && (
        <section className="hoja">
          <div className="fila"><h3>De qué producción salió</h3></div>
          {p.lotes.map((l) => (
            <Link key={l.id} to={`/produccion/${l.numero}`} className="fila">
              <div><div className="principal">{verFecha(l.fecha)}, turno {LABEL_TURNO[l.turno].toLowerCase()} · {l.maquina}</div><div className="chico tenue">Parte {nroTicket(l.numero)} · {l.personal}</div></div>
              <span className="cifra">{l.paquetes} paq.</span>
            </Link>
          ))}
        </section>
      )}

      {p.origen && p.origen.length > 0 && (
        <section className="hoja">
          <div className="fila"><h3>Materia prima usada</h3><span className="chico tenue">últimos ingresos antes de producir</span></div>
          {p.origen.map((o) => (
            <div className="fila" key={o.id} style={{ alignItems: 'start' }}>
              <div>
                <div className="principal">{o.nombre}: {formatCantidad(o.real, o.unidad)}</div>
                {o.compras.map((c) => (
                  <div key={c.id} className="chico"><Link to={`/compras/${c.numero}`}>{c.tipo === 'pesaje' ? 'Ticket' : 'Compra'} {nroTicket(c.numero)}</Link> · {c.proveedor} · {verFecha(c.fecha)} · {formatCantidad(c.cantidad, o.unidad)}</div>
                ))}
                {!o.compras.length && <div className="chico tenue">No hay compras cargadas de esta materia prima antes de la producción.</div>}
              </div>
            </div>
          ))}
        </section>
      )}

      <dl className="resumen hoja relleno">
        <dt>Cargado por</dt><dd>{p.armadoPor}, {verMomento(p.armadoAt)}</dd>
        <dt>Medidas</dt><dd>{p.ancho} × {p.largo} paquetes, {p.alto} de alto{p.vehiculo ? ` · para ${LABEL_VEHICULO[p.vehiculo].toLowerCase()}` : ''}</dd>
        {p.destino && <><dt>Para</dt><dd>{p.destino}</dd></>}
        {p.notas && <><dt>{p.notas === 'Plastificadora' ? 'Dónde' : 'Observaciones'}</dt><dd>{p.notas}</dd></>}
      </dl>

      {!recien && (
        <section className="etiqueta-al-pie">
          <h3>Etiqueta</h3>
          {etiqueta}
        </section>
      )}

      {/* Anular es la excepción (pallet cargado por error): al pie, lejos de Imprimir. */}
      {!p.anuladoAt && !vendido && puede('produccion', 3) && (
        <div style={{ display: 'flex', justifyContent: 'center' }}><button className="boton fantasma peligro" onClick={() => setAnulando(true)}><Ban size={18} aria-hidden /> Anular este pallet</button></div>
      )}

      {anulando && (
        <Dialogo titulo={`Anular pallet ${nroTicket(p.numero)}`} onCerrar={() => setAnulando(false)}>
          <p className="tenue">Para un pallet cargado por error: sale del stock y la etiqueta deja de valer (sacala del film).</p>
          <Campo etiqueta="Motivo"><textarea className="entrada" value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus /></Campo>
          <Aviso>{err}</Aviso>
          <div className="acciones">
            <button className="boton secundario" onClick={() => setAnulando(false)}>No anular</button>
            <button className="boton peligro" disabled={motivo.trim().length < 3} onClick={anular}>Anular pallet</button>
          </div>
        </Dialogo>
      )}
    </div>
  );
}

/**
 * La etiqueta que se pega en el film: maple, alto, maples, fecha y hora de carga, número de pallet y un QR único
 * (lleva a la ficha del pallet; la pistola de la zona de carga lee el número de ahí).
 */
export function EtiquetaPalet({ p, onLista }: {
  p: { numero: number; codigo: string; variante: string; colorHex: string | null; alto: number; paquetes: number; maplesPorPaquete: number; armadoAt: string; destino?: string | null; producido?: string[] };
  onLista?: () => void;
}) {
  const { data: empresa } = useEmpresa();
  const [qr, setQr] = useState('');
  useEffect(() => {
    QRCode.toString(`${window.location.origin}/palets/${p.numero}`, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }).then(setQr).catch(() => setQr(''));
  }, [p.numero]);
  useEffect(() => { if (qr) onLista?.(); }, [qr]); // eslint-disable-line react-hooks/exhaustive-deps
  const fechas = p.producido ?? [];
  return (
    <article className="etiqueta" aria-label="Etiqueta del pallet">
      <div className="franja" style={{ background: p.colorHex ?? COLOR_CARTON }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div>
          <div className="codigo">{p.codigo}</div>
          <div>{p.variante} · {p.alto} de alto</div>
        </div>
        <img src="/logo.webp" width={44} height={44} alt={empresa?.razonSocial ?? ''} style={{ borderRadius: 8 }} />
      </div>
      {qr && <div className="qr" dangerouslySetInnerHTML={{ __html: qr }} />}
      <div className="datos">
        <div>Pallet<b>{nroTicket(p.numero)}</b></div>
        <div>Alto<b>{p.alto}</b></div>
        <div>Maples<b>{(p.paquetes * p.maplesPorPaquete).toLocaleString('es-AR')}</b></div>
        <div>Cargado<b>{verMomento(p.armadoAt)}</b></div>
        {fechas.length > 0 && <div>Producido<b>{verFecha(fechas[0]!)}{fechas.length > 1 && fechas[0] !== fechas[fechas.length - 1] ? ` al ${verFecha(fechas[fechas.length - 1]!)}` : ''}</b></div>}
        {p.destino && <div>Para<b>{p.destino}</b></div>}
      </div>
      {empresa && <div className="chico">{empresa.razonSocial} · {[empresa.direccion, empresa.telefono].filter(Boolean).join(' · ')}</div>}
    </article>
  );
}
