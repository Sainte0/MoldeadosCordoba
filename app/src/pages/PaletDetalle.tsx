import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { ArrowLeft, Ban, CheckCircle2, Printer, Truck } from 'lucide-react';
import { COLOR_CARTON, formatCantidad, LABEL_TAMANO, LABEL_TURNO, LABEL_VEHICULO, type Turno, type Unidad, type Vehiculo } from '@moldeados/shared';
import { api, nroTicket, useSesion, verFecha, verMomento } from '../api';
import { useEmpresa } from '../datos';
import { MapleVista } from '../MapleVista';
import { Aviso, Campo, Cargando, Dialogo } from '../ui';

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
  const { data: empresa } = useEmpresa();
  const { data: p, isLoading, error } = useQuery({ queryKey: ['palet', id], queryFn: () => api<Traza>(`/palets/${id}`) });
  const [qr, setQr] = useState('');
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    // El QR lleva a esta misma página: con el celular se escanea y se ve la trazabilidad (pide entrar si hace falta).
    QRCode.toString(`${window.location.origin}/palets/${id}`, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }).then(setQr).catch(() => setQr(''));
  }, [id]);

  if (isLoading) return <Cargando />;
  if (!p) return <Aviso>{error instanceof Error ? error.message : 'No encontramos ese palet'}</Aviso>;
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

  return (
    <div className="columna solo-etiqueta" style={{ display: 'grid', gap: 20 }}>
      <Link to="/palets" className="boton fantasma" style={{ justifySelf: 'start' }}><ArrowLeft size={18} aria-hidden /> Stock y palets</Link>
      {params.get('nuevo') && !p.anuladoAt && <div className="aviso ok" style={{ display: 'flex', gap: 10, alignItems: 'center' }}><CheckCircle2 size={22} aria-hidden /> Palet armado. Imprimí la etiqueta y pegala en el film.</div>}
      {p.anuladoAt && <Aviso>Palet anulado por {p.anuladoPor}, {verMomento(p.anuladoAt)}: {p.motivoAnulacion}</Aviso>}

      <article className="etiqueta" aria-label="Etiqueta del palet">
        <div className="franja" style={{ background: p.colorHex ?? COLOR_CARTON }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div>
            <div className="codigo">{p.codigo}</div>
            <div>{p.variante}</div>
          </div>
          <img src="/logo.png" width={44} height={44} alt={empresa?.razonSocial ?? ''} style={{ borderRadius: 8 }} />
        </div>
        {qr && <div className="qr" dangerouslySetInnerHTML={{ __html: qr }} />}
        <div className="datos">
          <div>Palet<b>{nroTicket(p.numero)}</b></div>
          <div>Paquetes<b>{p.paquetes} × {p.maplesPorPaquete}</b></div>
          <div>Maples<b>{(p.paquetes * p.maplesPorPaquete).toLocaleString('es-AR')}</b></div>
          <div>Armado<b>{p.ancho}×{p.largo}×{p.alto}</b></div>
          {fechas.length > 0 && <div>Producido<b>{verFecha(fechas[0]!)}{fechas.length > 1 && fechas[0] !== fechas[fechas.length - 1] ? ` al ${verFecha(fechas[fechas.length - 1]!)}` : ''}</b></div>}
          {p.destino && <div>Para<b>{p.destino}</b></div>}
        </div>
        {empresa && <div className="chico">{empresa.razonSocial} · {[empresa.direccion, empresa.telefono].filter(Boolean).join(' · ')}</div>}
      </article>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button className="boton primario grande" onClick={() => window.print()}><Printer size={20} aria-hidden /> Imprimir etiqueta</button>
        {!p.anuladoAt && !p.venta && p.puedeDespachar && <Link to={`/ventas/nueva?palet=${p.id}`} className="boton primario grande"><Truck size={20} aria-hidden /> Despachar este palet</Link>}
        {!p.anuladoAt && !p.venta && puede('produccion', 3) && <button className="boton secundario" onClick={() => setAnulando(true)}><Ban size={18} aria-hidden /> Desarmar (anular)</button>}
      </div>

      {p.venta && (
        <section className="hoja relleno" style={{ display: 'grid', gap: 8 }}>
          <h3>Vendido</h3>
          <p>A <b>{p.venta.cliente}</b> el {verFecha(p.venta.fecha)}. Lo retiró {p.venta.retira}{p.venta.vehiculo ? ` en ${LABEL_VEHICULO[p.venta.vehiculo].toLowerCase()}` : ''}{p.venta.patente ? ` (${p.venta.patente})` : ''}.</p>
          {puede('ventas') && <Link to={`/ventas/${p.venta.id}`}>Ver remito {nroTicket(p.venta.numero)}</Link>}
        </section>
      )}
      <MapleVista color={p.colorHex} alto={180} />
      <dl className="resumen hoja relleno">
        <dt>Maple</dt><dd>{p.variante} ({LABEL_TAMANO[p.tamano].toLowerCase()})</dd>
        {p.vehiculo && <><dt>Vehículo</dt><dd>{LABEL_VEHICULO[p.vehiculo]}</dd></>}
        <dt>Armado por</dt><dd>{p.armadoPor}, {verMomento(p.armadoAt)}</dd>
        {p.notas && <><dt>Notas</dt><dd>{p.notas}</dd></>}
      </dl>

      {p.lotes && (
        <section className="hoja">
          <div className="fila"><h3>De qué producción salió</h3></div>
          {p.lotes.map((l) => (
            <Link key={l.id} to={`/produccion/${l.id}`} className="fila">
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
                  <div key={c.id} className="chico"><Link to={`/compras/${c.id}`}>{c.tipo === 'pesaje' ? 'Ticket' : 'Compra'} {nroTicket(c.numero)}</Link> · {c.proveedor} · {verFecha(c.fecha)} · {formatCantidad(c.cantidad, o.unidad)}</div>
                ))}
                {!o.compras.length && <div className="chico tenue">No hay compras cargadas de esta materia prima antes de la producción.</div>}
              </div>
            </div>
          ))}
        </section>
      )}

      {anulando && (
        <Dialogo titulo={`Desarmar palet ${nroTicket(p.numero)}`} onCerrar={() => setAnulando(false)}>
          <p className="tenue">Los paquetes vuelven a quedar sueltos. La etiqueta deja de valer: sacala del palet.</p>
          <Campo etiqueta="Motivo"><textarea className="entrada" value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus /></Campo>
          <Aviso>{err}</Aviso>
          <div className="acciones">
            <button className="boton secundario" onClick={() => setAnulando(false)}>Volver</button>
            <button className="boton peligro" disabled={motivo.trim().length < 3} onClick={anular}>Desarmar</button>
          </div>
        </Dialogo>
      )}
    </div>
  );
}
