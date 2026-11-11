import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, Ban } from 'lucide-react';
import { formatPesos, LABEL_MEDIO, type Medio } from '@moldeados/shared/base';
import { api, nroTicket, useSesion, verFecha } from '../api';
import { Aviso, Campo, Cargando, Dialogo, Volver } from '../ui';

interface Mov {
  id: string; numero: number; fecha: string; monto: number; tipo: string; signo: 1 | -1; saldo: number; anuladoAt: string | null;
  conFactura?: boolean; medio?: Medio; banco?: string | null; chequeNumero?: string | null; chequeFechaCobro?: string | null; referencia?: string | null;
}

export function CuentaDetalle() {
  const { de, id } = useParams() as { de: 'cliente' | 'proveedor'; id: string };
  const { puede } = useSesion();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ['cuenta', de, id], queryFn: () => api<{ id: string; nombre: string; movimientos: Mov[] }>(`/cuentas/${de}/${id}`) });
  const [anulando, setAnulando] = useState<Mov | null>(null);
  const [motivo, setMotivo] = useState('');
  const [err, setErr] = useState<string | null>(null);

  if (isLoading) return <Cargando />;
  if (!data) return <Aviso>{error instanceof Error ? error.message : 'No encontramos esa cuenta'}</Aviso>;
  const saldo = data.movimientos.at(-1)?.saldo ?? 0;
  const esCliente = de === 'cliente';
  const enlace = (m: Mov) => (m.tipo === 'saldo_inicial' ? null : m.signo === 1 ? (esCliente ? `/ventas/${m.id}` : `/compras/${m.id}`) : null);
  const nombre = (m: Mov) => (m.tipo === 'saldo_inicial' ? 'Saldo inicial' : m.signo === 1 ? (m.tipo === 'venta' ? 'Remito' : m.tipo === 'pesaje' ? 'Ticket de pesaje' : 'Compra') : esCliente ? 'Cobro' : 'Pago');

  const anular = async () => {
    if (!anulando) return;
    setErr(null);
    try {
      await api(`/dinero/${anulando.id}/anular`, { method: 'POST', body: { motivo } });
      await qc.invalidateQueries();
      setAnulando(null); setMotivo('');
    } catch (e) { setErr(e instanceof Error ? e.message : 'No se pudo anular'); }
  };

  return (
    <div className="columna" style={{ display: 'grid', gap: 20 }}>
      <Volver a="/cuentas" texto="Saldos" />
      <header>
        <h1>{data.nombre}</h1>
        <p className="tenue" style={{ marginTop: 6 }}>Cuenta corriente de {esCliente ? 'cliente' : 'proveedor'}</p>
      </header>
      <div className="lectura">
        <span>{saldo > 0 ? (esCliente ? 'Nos debe' : 'Le debemos') : saldo < 0 ? 'Saldo a favor' : 'Al día'}</span>
        <span className="cifra">{formatPesos(Math.abs(saldo))}</span>
      </div>
      {puede('cuentas', 2) && (
        <Link to={`/dinero/nuevo?tipo=${esCliente ? 'cobro' : 'pago'}&id=${data.id}`} className="boton primario grande">
          {esCliente ? <ArrowDownLeft size={20} aria-hidden /> : <ArrowUpRight size={20} aria-hidden />} Registrar {esCliente ? 'cobro' : 'pago'}
        </Link>
      )}
      <div className="hoja filas">
        {!data.movimientos.length && <p className="tenue" style={{ padding: 16 }}>Sin movimientos todavía.</p>}
        {[...data.movimientos].reverse().map((m) => {
          const contenido = (
            <>
              <div>
                <div className="principal">{nombre(m)}{m.tipo !== 'saldo_inicial' && ` ${nroTicket(m.numero)}`}</div>
                <div className="chico tenue">
                  {verFecha(m.fecha)}
                  {m.tipo === 'saldo_inicial' ? (m.referencia ? ` · ${m.referencia}` : '') : m.signo === 1 ? ` · ${m.conFactura ? 'con factura' : 'sin factura'}` : ` · ${LABEL_MEDIO[m.medio!]}${m.banco ? ` ${m.banco}` : ''}${m.chequeNumero ? ` n.º ${m.chequeNumero}` : ''}${m.chequeFechaCobro ? `, cobro ${verFecha(m.chequeFechaCobro)}` : ''}${m.referencia ? ` · ${m.referencia}` : ''}`}
                </div>
                {m.anuladoAt && <span className="marca-texto peligro">Anulado</span>}
              </div>
              <div className="derecha">
                <div className="cifra" style={{ color: m.anuladoAt ? 'var(--tinta-3)' : m.signo === 1 ? undefined : 'var(--ok)' }}>{m.signo === 1 ? '' : '− '}{formatPesos(m.monto)}</div>
                <div className="chico tenue">saldo {formatPesos(m.saldo)}</div>
              </div>
            </>
          );
          const a = enlace(m);
          return a ? <Link key={m.id} to={a} className={`fila${m.anuladoAt ? ' anulada' : ''}`}>{contenido}</Link> : (
            <div key={m.id} className={`fila${m.anuladoAt ? ' anulada' : ''}`} style={{ gridTemplateColumns: '1fr auto auto' }}>
              {contenido}
              {!m.anuladoAt && m.tipo !== 'saldo_inicial' && puede('cuentas', 3) && <button className="boton icono" aria-label="Anular" onClick={() => setAnulando(m)}><Ban size={18} /></button>}
            </div>
          );
        })}
      </div>
      {anulando && (
        <Dialogo titulo={`Anular ${esCliente ? 'cobro' : 'pago'} ${nroTicket(anulando.numero)}`} onCerrar={() => setAnulando(null)}>
          <p className="tenue">Por ejemplo, si un cheque vino rechazado. Vuelve a sumar a la deuda y queda registrado con tu nombre y el motivo.</p>
          <Campo etiqueta="Motivo"><textarea className="entrada" value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus /></Campo>
          <Aviso>{err}</Aviso>
          <div className="acciones"><button className="boton secundario" onClick={() => setAnulando(null)}>Volver</button><button className="boton peligro" disabled={motivo.trim().length < 3} onClick={anular}>Anular</button></div>
        </Dialogo>
      )}
    </div>
  );
}
