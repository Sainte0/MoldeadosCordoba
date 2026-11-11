import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Ban, CheckCircle2, PenLine, Printer, Truck, Wallet } from 'lucide-react';
import { formatIva, formatPesos, LABEL_VEHICULO, type Vehiculo } from '@moldeados/shared/base';
import { api, apiBlobUrl, nroTicket, useSesion, verFecha, verMomento } from '../api';
import { useUrlConNumero } from '../filtros';
import { Firma } from '../Firma';
import { useEmpresa } from '../datos';
import { Muestra } from '../MapleVista';
import { Estado } from '../Estado';
import { Aviso, Campo, Cargando, Dialogo, Volver } from '../ui';

interface Detalle {
  id: string; numero: number; fecha: string; conFactura: boolean; nroFactura: string | null; ivaBp: number; neto: number; iva: number; total: number;
  vehiculo: Vehiculo | null; patente: string | null; retira: string | null; notas: string | null; cargadaAt: string; anuladoAt: string | null; motivoAnulacion: string | null;
  anuladoPor: string | null; cargadoPor: string; clienteId: string; cliente: string; clienteCuit: string | null; clienteDireccion: string | null;
  firmaId: string | null; firmadoAt: string | null; pedidoId: string | null; pedidoNumero: number | null; cobro: { cobrado: number; debe: number } | null;
  items: { id: string; paletId: string | null; palet: number; suelto: boolean; paquetes: number; codigo: string; variante: string; colorHex: string | null; maples: number; precioMaple: number; subtotal: number; calidad: 'primera' | 'segunda' }[];
}

/** Remito de la venta: lo firma quien retira. */
export function VentaDetalle() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { puede } = useSesion();
  const qc = useQueryClient();
  const { data: empresa } = useEmpresa();
  const { data: v, isLoading, error } = useQuery({ queryKey: ['venta', id], queryFn: () => api<Detalle>(`/ventas/${id}`) });
  useUrlConNumero('/ventas', id, v?.numero);
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [firmando, setFirmando] = useState(false);
  const [trazo, setTrazo] = useState<string | null>(null);
  const [firma, setFirma] = useState<string | null>(null);
  useEffect(() => {
    if (!v?.firmaId) return;
    let url = '';
    apiBlobUrl(`/archivos/${v.firmaId}`).then((u) => { url = u; setFirma(u); }).catch(() => setFirma(null));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [v?.firmaId]);

  if (isLoading) return <Cargando />;
  if (!v) return <Aviso>{error instanceof Error ? error.message : 'No encontramos esa venta'}</Aviso>;
  const maples = v.items.reduce((a, i) => a + i.maples, 0);
  const sinPalets = v.items.every((i) => !i.paletId);

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
      <Volver a="/ventas" texto="Ventas" className="no-imprimir" />
      {params.get('nuevo') && !v.anuladoAt && <div className="aviso ok no-imprimir" style={{ display: 'flex', gap: 10, alignItems: 'center' }}><CheckCircle2 size={22} aria-hidden /> Despacho confirmado: la carga quedó vendida{v.firmaId ? ' y el remito firmado' : '. Imprimí el remito para que lo firme quien retira'}.</div>}

      <header className="cabeza-detalle no-imprimir">
        <span className="ico-detalle"><Truck size={22} aria-hidden /></span>
        <div>
          <h1>Remito {nroTicket(v.numero)}</h1>
          <p className="tenue">{v.cliente} · {verFecha(v.fecha)} · {maples.toLocaleString('es-AR')} maples · {formatPesos(v.total)}</p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {v.anuladoAt ? <Estado nivel="critico">Anulado</Estado> : <>
            {!v.cobro || v.cobro.debe <= 0 ? <Estado nivel="ok">Cobrado</Estado> : <Estado nivel="atencion">{v.cobro.cobrado > 0 ? `Debe ${formatPesos(v.cobro.debe)}` : 'Pendiente de cobro'}</Estado>}
            {v.firmaId ? <Estado nivel="ok">Firmado</Estado> : <Estado nivel="atencion">Sin firmar</Estado>}
          </>}
        </div>
      </header>
      <div className="no-imprimir" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {!v.anuladoAt && !v.firmaId && puede('ventas', 2) && <button className="boton primario grande" onClick={() => setFirmando(true)}><PenLine size={20} aria-hidden /> Firmar en pantalla</button>}
        <button className={`boton ${!v.anuladoAt && !v.firmaId && puede('ventas', 2) ? 'secundario' : 'primario grande'}`} onClick={() => window.print()}><Printer size={20} aria-hidden /> Imprimir remito</button>
        {!v.anuladoAt && puede('cuentas', 2) && <Link to={`/dinero/nuevo?tipo=cobro&id=${v.clienteId}`} className="boton secundario"><Wallet size={18} aria-hidden /> Pago a cuenta</Link>}
        {!v.anuladoAt && puede('ventas', 3) && <button className="boton secundario" onClick={() => setAnulando(true)}><Ban size={18} aria-hidden /> Anular</button>}
      </div>
      <article className="ticket remito">
        <div className="encabezado">
          <div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><img src="/logo.webp" width={36} height={36} alt="" style={{ borderRadius: 7 }} /><b>{empresa?.razonSocial}</b></div>
            <div className="chico tenue">{[empresa?.direccion, empresa?.telefono, empresa?.cuit && `CUIT ${empresa.cuit}`].filter(Boolean).join(' · ')}</div>
            <div className="chico tenue">Remito de entrega</div>
          </div>
          <div style={{ textAlign: 'right' }}><div className="cifra numero">{nroTicket(v.numero)}</div><div className="chico">{verFecha(v.fecha)}</div></div>
        </div>
        {v.anuladoAt && <div><span className="sello">Anulado</span><p className="chico" style={{ marginTop: 8 }}>{v.anuladoPor}, {verMomento(v.anuladoAt)}: {v.motivoAnulacion}</p></div>}
        <dl className="resumen">
          <dt>Cliente</dt><dd>{v.cliente}{v.clienteCuit && <span className="tenue"> · CUIT {v.clienteCuit}</span>}</dd>
          {v.clienteDireccion && <><dt>Dirección</dt><dd>{v.clienteDireccion}</dd></>}
          {v.retira && <><dt>Retira</dt><dd>{v.retira}</dd></>}
          {v.pedidoId && <><dt>Pedido</dt><dd><Link to={`/pedidos/${v.pedidoNumero}`}>{nroTicket(v.pedidoNumero ?? 0)}</Link></dd></>}
          {(v.vehiculo || v.patente) && <><dt>Vehículo</dt><dd>{[v.vehiculo && LABEL_VEHICULO[v.vehiculo], v.patente].filter(Boolean).join(' · ')}</dd></>}
          <dt>Factura</dt><dd>{v.conFactura ? `Sí${v.nroFactura ? ` · ${v.nroFactura}` : ''}` : 'No'}</dd>
        </dl>
        {sinPalets && <p className="chico tenue no-imprimir">Venta anterior al sistema, cargada desde la planilla de finanzas: no tiene palets asignados. Las ventas nuevas muestran acá cada palet que se llevó.</p>}
        <table>
          <thead><tr>{!sinPalets && <th>Palet</th>}<th>Maple</th><th>Maples</th><th>Precio</th><th>Subtotal</th></tr></thead>
          <tbody>
            {v.items.map((i) => (
              <tr key={i.id}>
                {!sinPalets && <td>{!i.paletId ? '—' : i.suelto ? `${i.paquetes} sueltos` : <Link to={`/palets/${i.palet}`}>{nroTicket(i.palet)}</Link>}</td>}
                <td><span className="con-muestra" style={{ gap: 6 }}><Muestra color={i.colorHex} />{i.codigo}{i.calidad === 'segunda' && ' (2da)'}</span></td>
                <td>{i.maples.toLocaleString('es-AR')}</td><td>{formatPesos(i.precioMaple)}</td><td>{formatPesos(i.subtotal)}</td>
              </tr>
            ))}
            {v.iva > 0 && <tr><td colSpan={sinPalets ? 3 : 4}>IVA {formatIva(v.ivaBp)}</td><td>{formatPesos(v.iva)}</td></tr>}
            <tr><th colSpan={sinPalets ? 1 : 2}>Total</th><th>{maples.toLocaleString('es-AR')}</th><th /><th className="cifra" style={{ fontSize: '1.4rem' }}>{formatPesos(v.total)}</th></tr>
          </tbody>
        </table>
        {v.notas && <p><b>Observaciones:</b> {v.notas}</p>}
        {firma ? (
          <div style={{ display: 'grid', gap: 4, justifyItems: 'start' }}>
            <img src={firma} alt={`Firma de ${v.retira ?? 'quien retira'}`} style={{ maxHeight: 110, maxWidth: '100%' }} />
            <div className="chico tenue" style={{ borderTop: '1px solid var(--tinta)', paddingTop: 4, minWidth: 220 }}>{v.retira} · firmó en pantalla {v.firmadoAt && verMomento(v.firmadoAt)}</div>
          </div>
        ) : <div className="firma"><div>Firma de quien retira</div><div>Aclaración y DNI</div></div>}
        <p className="chico tenue">{sinPalets ? 'Cargado desde la planilla' : 'Despachado'} por {v.cargadoPor}, {verMomento(v.cargadaAt)}</p>
      </article>


      {firmando && (
        <Dialogo titulo="Firma de quien retira" onCerrar={() => setFirmando(false)}>
          <p className="tenue">{v.retira} recibe {maples.toLocaleString('es-AR')} maples para {v.cliente}.</p>
          <Firma onCambio={setTrazo} />
          <Aviso>{err}</Aviso>
          <div className="acciones">
            <button className="boton secundario" onClick={() => setFirmando(false)}>Cancelar</button>
            <button className="boton primario" disabled={!trazo} onClick={async () => {
              setErr(null);
              try { await api(`/ventas/${v.id}/firma`, { method: 'POST', body: { firma: trazo } }); await qc.invalidateQueries({ queryKey: ['venta', id] }); setFirmando(false); }
              catch (e) { setErr(e instanceof Error ? e.message : 'No se pudo guardar la firma'); }
            }}>Guardar firma</button>
          </div>
        </Dialogo>
      )}
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
