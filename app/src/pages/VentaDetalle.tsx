import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Ban, CheckCircle2, Printer, Wallet } from 'lucide-react';
import { formatIva, formatPesos, LABEL_VEHICULO, type Vehiculo } from '@moldeados/shared';
import { api, nroTicket, useSesion, verFecha, verMomento } from '../api';
import { useEmpresa } from '../datos';
import { Muestra } from '../MapleVista';
import { Aviso, Campo, Cargando, Dialogo } from '../ui';

interface Detalle {
  id: string; numero: number; fecha: string; conFactura: boolean; nroFactura: string | null; ivaBp: number; neto: number; iva: number; total: number;
  vehiculo: Vehiculo | null; patente: string | null; retira: string | null; notas: string | null; cargadaAt: string; anuladoAt: string | null; motivoAnulacion: string | null;
  anuladoPor: string | null; cargadoPor: string; clienteId: string; cliente: string; clienteCuit: string | null; clienteDireccion: string | null;
  items: { id: string; paletId: string; palet: number; paquetes: number; codigo: string; variante: string; colorHex: string | null; maples: number; precioMaple: number; subtotal: number }[];
}

/** Remito de la venta: lo firma quien retira. */
export function VentaDetalle() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { puede } = useSesion();
  const qc = useQueryClient();
  const { data: empresa } = useEmpresa();
  const { data: v, isLoading, error } = useQuery({ queryKey: ['venta', id], queryFn: () => api<Detalle>(`/ventas/${id}`) });
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [err, setErr] = useState<string | null>(null);

  if (isLoading) return <Cargando />;
  if (!v) return <Aviso>{error instanceof Error ? error.message : 'No encontramos esa venta'}</Aviso>;
  const maples = v.items.reduce((a, i) => a + i.maples, 0);

  const anular = async () => {
    setErr(null);
    try {
      await api(`/ventas/${v.id}/anular`, { method: 'POST', body: { motivo } });
      await qc.invalidateQueries();
      setAnulando(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo anular');
    }
  };

  return (
    <div className="columna" style={{ display: 'grid', gap: 20 }}>
      <Link to="/ventas" className="boton fantasma no-imprimir" style={{ justifySelf: 'start' }}><ArrowLeft size={18} aria-hidden /> Ventas</Link>
      {params.get('nuevo') && !v.anuladoAt && <div className="aviso ok no-imprimir" style={{ display: 'flex', gap: 10, alignItems: 'center' }}><CheckCircle2 size={22} aria-hidden /> Despacho confirmado. Los palets quedaron vendidos. Imprimí el remito para que lo firme quien retira.</div>}

      <article className="ticket remito">
        <div className="encabezado">
          <div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><img src="/logo.png" width={36} height={36} alt="" style={{ borderRadius: 7 }} /><b>{empresa?.razonSocial}</b></div>
            <div className="chico tenue">{[empresa?.direccion, empresa?.telefono, empresa?.cuit && `CUIT ${empresa.cuit}`].filter(Boolean).join(' · ')}</div>
            <div className="chico tenue">Remito de entrega</div>
          </div>
          <div style={{ textAlign: 'right' }}><div className="cifra numero">{nroTicket(v.numero)}</div><div className="chico">{verFecha(v.fecha)}</div></div>
        </div>
        {v.anuladoAt && <div><span className="sello">Anulado</span><p className="chico" style={{ marginTop: 8 }}>{v.anuladoPor}, {verMomento(v.anuladoAt)}: {v.motivoAnulacion}</p></div>}
        <dl className="resumen">
          <dt>Cliente</dt><dd>{v.cliente}{v.clienteCuit && <span className="tenue"> · CUIT {v.clienteCuit}</span>}</dd>
          {v.clienteDireccion && <><dt>Dirección</dt><dd>{v.clienteDireccion}</dd></>}
          <dt>Retira</dt><dd>{v.retira}</dd>
          {(v.vehiculo || v.patente) && <><dt>Vehículo</dt><dd>{[v.vehiculo && LABEL_VEHICULO[v.vehiculo], v.patente].filter(Boolean).join(' · ')}</dd></>}
          <dt>Factura</dt><dd>{v.conFactura ? `Sí${v.nroFactura ? ` · ${v.nroFactura}` : ''}` : 'No'}</dd>
        </dl>
        <table>
          <thead><tr><th>Palet</th><th>Maple</th><th>Maples</th><th>Precio</th><th>Subtotal</th></tr></thead>
          <tbody>
            {v.items.map((i) => (
              <tr key={i.id}>
                <td><Link to={`/palets/${i.paletId}`}>{nroTicket(i.palet)}</Link></td>
                <td><span className="con-muestra" style={{ gap: 6 }}><Muestra color={i.colorHex} />{i.codigo}</span></td>
                <td>{i.maples.toLocaleString('es-AR')}</td><td>{formatPesos(i.precioMaple)}</td><td>{formatPesos(i.subtotal)}</td>
              </tr>
            ))}
            {v.iva > 0 && <tr><td colSpan={4}>IVA {formatIva(v.ivaBp)}</td><td>{formatPesos(v.iva)}</td></tr>}
            <tr><th colSpan={2}>Total</th><th>{maples.toLocaleString('es-AR')}</th><th /><th className="cifra" style={{ fontSize: '1.4rem' }}>{formatPesos(v.total)}</th></tr>
          </tbody>
        </table>
        {v.notas && <p><b>Notas:</b> {v.notas}</p>}
        <div className="firma"><div>Firma de quien retira</div><div>Aclaración y DNI</div></div>
        <p className="chico tenue">Despachado por {v.cargadoPor}, {verMomento(v.cargadaAt)}</p>
      </article>

      <div className="no-imprimir" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button className="boton primario grande" onClick={() => window.print()}><Printer size={20} aria-hidden /> Imprimir remito</button>
        {!v.anuladoAt && puede('cuentas', 2) && <Link to={`/dinero/nuevo?tipo=cobro&id=${v.clienteId}`} className="boton secundario"><Wallet size={18} aria-hidden /> Registrar cobro</Link>}
        {!v.anuladoAt && puede('ventas', 3) && <button className="boton secundario" onClick={() => setAnulando(true)}><Ban size={18} aria-hidden /> Anular</button>}
      </div>

      {anulando && (
        <Dialogo titulo={`Anular remito ${nroTicket(v.numero)}`} onCerrar={() => setAnulando(false)}>
          <p className="tenue">Los palets vuelven a estar disponibles y se descuenta de la cuenta del cliente. Queda registrado con tu nombre y el motivo.</p>
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
