import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Ban, CheckCircle2, Printer, Scale, ShoppingCart } from 'lucide-react';
import { formatCantidad, formatIva, formatPesos, type Unidad } from '@moldeados/shared/base';
import { api, nroTicket, useSesion, verFecha, verMomento } from '../api';
import { useUrlConNumero } from '../filtros';
import { Aviso, Campo, Cargando, Dialogo, Volver } from '../ui';
import { useEmpresa } from '../datos';
import { Estado } from '../Estado';

interface Detalle {
  id: string; numero: number; tipo: 'pesaje' | 'compra'; fecha: string; conFactura: boolean; nroFactura: string | null; ivaBp: number;
  neto: number; iva: number; total: number; brutoG: number | null; taraG: number | null; patente: string | null; notas: string | null;
  cargadaAt: string; anuladaAt: string | null; motivoAnulacion: string | null; proveedor: string; proveedorCuit: string | null;
  cargadoPor: string; anuladaPor: string | null;
  items: { id: string; nombre: string; unidad: Unidad; cantidad: number; precioUnitario: number; subtotal: number }[];
}

export function CompraDetalle() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { puede } = useSesion();
  const qc = useQueryClient();
  const { data: empresa } = useEmpresa();
  const { data: c, isLoading, error } = useQuery({ queryKey: ['compra', id], queryFn: () => api<Detalle>(`/compras/${id}`) });
  useUrlConNumero('/compras', id, c?.numero);
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [err, setErr] = useState<string | null>(null);

  if (isLoading) return <Cargando />;
  if (!c) return <Aviso>{error instanceof Error ? error.message : 'No encontramos esa compra'}</Aviso>;
  const pesaje = c.tipo === 'pesaje';

  const anular = async () => {
    setErr(null);
    try {
      await api(`/compras/${c.id}/anular`, { method: 'POST', body: { motivo } });
      await qc.invalidateQueries();
      setAnulando(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo anular');
    }
  };

  return (
    <div className="columna" style={{ display: 'grid', gap: 20 }}>
      <Volver a="/compras" texto="Compras" className="no-imprimir" />
      {params.get('nuevo') && !c.anuladaAt && (
        <div className="aviso ok no-imprimir" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <CheckCircle2 size={22} aria-hidden /> {pesaje ? 'Ticket guardado. El cartón ya está sumado al stock.' : 'Compra guardada. Ya está sumada al stock.'}
        </div>
      )}

      <header className="cabeza-detalle no-imprimir">
        <span className="ico-detalle">{pesaje ? <Scale size={22} aria-hidden /> : <ShoppingCart size={22} aria-hidden />}</span>
        <div>
          <h1>{pesaje ? 'Ticket' : 'Compra'} {nroTicket(c.numero)}</h1>
          <p className="tenue">{c.proveedor} · {verFecha(c.fecha)} · {formatPesos(c.total)} · {c.conFactura ? 'con factura' : 'sin factura'}</p>
        </div>
        {c.anuladaAt && <Estado nivel="critico">Anulada</Estado>}
      </header>
      <div className="no-imprimir" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button className="boton secundario" onClick={() => window.print()}><Printer size={18} aria-hidden /> Imprimir</button>
        {!c.anuladaAt && puede('compras', 3) && <button className="boton fantasma" onClick={() => setAnulando(true)}><Ban size={18} aria-hidden /> Anular</button>}
      </div>
      <article className="ticket">
        <div className="encabezado">
          <div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <img src="/logo.webp" width={36} height={35} alt="" style={{ borderRadius: 7 }} />
              <b>{empresa?.razonSocial ?? 'Moldeados Córdoba'}</b>
            </div>
            <div className="chico tenue">{[empresa?.direccion, empresa?.telefono].filter(Boolean).join(' · ')}</div>
            <div className="chico tenue">{pesaje ? 'Ticket de pesaje' : 'Compra de materia prima'}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="cifra numero">{nroTicket(c.numero)}</div>
            <div className="chico">{verFecha(c.fecha)}</div>
          </div>
        </div>
        {c.anuladaAt && <div><span className="sello">Anulado</span><p className="chico" style={{ marginTop: 8 }}>{c.anuladaPor}, {verMomento(c.anuladaAt)}: {c.motivoAnulacion}</p></div>}
        <dl className="resumen">
          <dt>Proveedor</dt><dd>{c.proveedor}{c.proveedorCuit && <span className="tenue"> · CUIT {c.proveedorCuit}</span>}</dd>
          {c.patente && <><dt>Patente</dt><dd>{c.patente}</dd></>}
          {pesaje && c.brutoG !== null && <>
            <dt>Bruto</dt><dd className="cifra">{formatCantidad(c.brutoG, 'kg')}</dd>
            <dt>Tara</dt><dd className="cifra">{formatCantidad(c.taraG ?? 0, 'kg')}</dd>
          </>}
          <dt>Factura</dt><dd>{c.conFactura ? `Sí${c.nroFactura ? ` · ${c.nroFactura}` : ''}` : 'No'}</dd>
        </dl>
        <table>
          <thead><tr><th>Producto</th><th>Cantidad</th><th>Precio</th><th>Subtotal</th></tr></thead>
          <tbody>
            {c.items.map((i) => (
              <tr key={i.id}><td>{i.nombre}</td><td>{formatCantidad(i.cantidad, i.unidad)}</td><td>{formatPesos(i.precioUnitario)}</td><td>{formatPesos(i.subtotal)}</td></tr>
            ))}
            {c.iva > 0 && <tr><td colSpan={3}>IVA {formatIva(c.ivaBp)}</td><td>{formatPesos(c.iva)}</td></tr>}
            <tr><th colSpan={3}>Total</th><th className="cifra" style={{ fontSize: '1.4rem' }}>{formatPesos(c.total)}</th></tr>
          </tbody>
        </table>
        {c.notas && <p><b>Notas:</b> {c.notas}</p>}
        <p className="chico tenue">Registrado por {c.cargadoPor}, {verMomento(c.cargadaAt)}</p>
      </article>


      {anulando && (
        <Dialogo titulo={`Anular ${pesaje ? 'ticket' : 'compra'} ${nroTicket(c.numero)}`} onCerrar={() => setAnulando(false)}>
          <p className="tenue">Se descuenta del stock lo que había sumado. No se borra: queda registrada como anulada, con tu nombre y el motivo.</p>
          <Campo etiqueta="Motivo"><textarea className="entrada" value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus /></Campo>
          <Aviso>{err}</Aviso>
          <div className="acciones">
            <button className="boton secundario" onClick={() => setAnulando(false)}>Volver</button>
            <button className="boton peligro" disabled={motivo.trim().length < 3} onClick={anular}>Anular</button>
          </div>
        </Dialogo>
      )}
    </div>
  );
}
