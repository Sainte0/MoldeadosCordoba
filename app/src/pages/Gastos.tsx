import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, CheckCircle2, Paperclip, Plus } from 'lucide-react';
import { formatPesos, LABEL_MEDIO_GASTO, MEDIOS_GASTO, plural, type MedioGasto } from '@moldeados/shared/base';
import { api, apiBlobUrl, hoy, nroTicket, useSesion, verFecha, verMomento } from '../api';
import { useDemorado, useFiltros } from '../filtros';
import { useBancos, useCategoriasGasto } from '../datos';
import { Estado } from '../Estado';
import { BotonExportar } from './Exportar';
import { Aviso, Buscador, Cabecera, Campo, Cargando, Dialogo, Entrada, Opciones } from '../ui';

interface GastoFila { id: string; numero: number; fecha: string; descripcion: string; monto: number; medio: MedioGasto | null; conFactura: boolean; beneficiario: string | null; aPagar: boolean; vencimiento: string | null; montoUsd: number | null; comprobanteId: string | null; anuladoAt: string | null; categoria: string; empleado: string | null; cargadoPor: string }

const inicioMes = () => { const h = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date()); return h.slice(0, 8) + '01'; };

export function Gastos() {
  const { puede } = useSesion();
  const [params] = useSearchParams();
  const { data: categorias } = useCategoriasGasto();
  const [f, setF] = useFiltros({ desde: inicioMes(), hasta: '', categoria: '', q: '', estado: '' });
  const { desde, hasta, categoria: categoriaId } = f;
  const q = useDemorado(f.q);
  // Pendientes: todos los que falta pagar, sin importar el mes.
  const pendientes = f.estado === 'pendientes';
  const { data, isLoading } = useQuery({ queryKey: ['gastos', desde, hasta, categoriaId, q, f.estado], queryFn: () => api<GastoFila[]>(pendientes ? `/gastos?estado=pendientes&categoriaId=${categoriaId}&q=${encodeURIComponent(q)}` : `/gastos?desde=${desde}&hasta=${hasta}&categoriaId=${categoriaId}&q=${encodeURIComponent(q)}`) });
  const [viendo, setViendo] = useState<string | null>(null);
  const vigentes = (data ?? []).filter((g) => !g.anuladoAt);

  return (
    <div className="ancho" style={{ display: 'grid', gap: 20 }}>
      <Cabecera titulo="Egresos" bajada="Todo lo que sale: sueldos, impuestos, servicios, mantenimiento, insumos. Lo pendiente de pago, con su vencimiento.">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {puede('gastos', 2) && <Link to="/egresos/nuevo" className="boton primario"><Plus size={18} aria-hidden /> Cargar egreso</Link>}
        </div>
      </Cabecera>
      {params.get('nuevo') && <div className="aviso ok" style={{ display: 'flex', gap: 10, alignItems: 'center' }}><CheckCircle2 size={22} aria-hidden /> Egreso guardado.</div>}
      <div className="pestanas" role="group" aria-label="Estado">
        <button aria-pressed={!pendientes} onClick={() => setF({ estado: '' })}>Todos</button>
        <button aria-pressed={pendientes} onClick={() => setF({ estado: 'pendientes' })}>Pendientes de pago</button>
      </div>

      <div className="hoja relleno" style={{ display: 'grid', gap: 12 }}>
        <Buscador placeholder="Buscar concepto, proveedor / beneficiario, categoría o comprobante" value={f.q} onChange={(e) => setF({ q: e.target.value })} aria-label="Buscar egresos" />
        {!pendientes && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          <label className="campo"><span>Desde</span><Entrada type="date" value={desde} onChange={(e) => setF({ desde: e.target.value })} /></label>
          <label className="campo"><span>Hasta</span><Entrada type="date" value={hasta} onChange={(e) => setF({ hasta: e.target.value })} /></label>
          <div style={{ alignSelf: 'end' }}><BotonExportar que="gastos" desde={desde} hasta={hasta} /></div>
        </div>}
        <Campo etiqueta="Categoría"><select className="entrada" value={categoriaId} onChange={(e) => setF({ categoria: e.target.value })}><option value="">Todas</option>{(categorias ?? []).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></Campo>
      </div>

      {isLoading ? <Cargando /> : !data?.length ? <div className="hoja vacio"><p>{pendientes ? 'No hay egresos pendientes de pago.' : 'No hay egresos con estos filtros.'}</p></div> : (
        <>
          <div className="lectura"><span>{plural(vigentes.length, 'egreso', 'egresos')}{pendientes ? ' pendientes' : ''}</span><span className="cifra">{formatPesos(vigentes.reduce((a, g) => a + g.monto, 0))}</span></div>
          <div className="hoja filas">
            {data.map((g) => (
              <button key={g.id} className={`fila${g.anuladoAt ? ' anulada' : ''}`} onClick={() => setViendo(g.id)}>
                <div>
                  <div className="principal">{g.descripcion}{g.empleado ? ` · ${g.empleado}` : g.beneficiario ? ` · ${g.beneficiario}` : ''}</div>
                  <div className="chico tenue">{verFecha(g.fecha)} · {g.categoria}{g.medio ? ` · ${LABEL_MEDIO_GASTO[g.medio]}` : ''}{g.montoUsd ? ` · US$ ${(g.montoUsd / 100).toLocaleString('es-AR')}` : ''}</div>
                </div>
                <div className="derecha">
                  <div className="cifra">{formatPesos(g.monto)}</div>
                  {g.anuladoAt ? <span className="marca-texto peligro">Anulado</span>
                    : g.aPagar ? <span className={`marca-texto ${g.vencimiento && g.vencimiento <= hoy() ? 'peligro' : 'alerta'}`}>{g.vencimiento ? `Pendiente · vence ${verFecha(g.vencimiento).replace(/ de \d{4}$/, '')}` : 'Pendiente'}</span>
                    : <span className="chico tenue" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>{g.comprobanteId && <Paperclip size={14} aria-label="Con comprobante" />}Pagado</span>}
                </div>
              </button>
            ))}
          </div>
        </>
      )}
      {viendo && <DetalleGasto id={viendo} onCerrar={() => setViendo(null)} />}
    </div>
  );
}

interface Detalle extends GastoFila { banco: string | null; nroFactura: string | null; notas: string | null; cargadoAt: string; motivoAnulacion: string | null; anuladoPor: string | null; pagadoAt: string | null; pagadoPor: string | null }

function DetalleGasto({ id, onCerrar }: { id: string; onCerrar: () => void }) {
  const { puede } = useSesion();
  const qc = useQueryClient();
  const { data: g } = useQuery({ queryKey: ['gasto', id], queryFn: () => api<Detalle>(`/gastos/${id}`) });
  const [foto, setFoto] = useState<string | null>(null);
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pagando, setPagando] = useState(false);
  const [medio, setMedio] = useState<MedioGasto | null>(null);
  const [bancoId, setBancoId] = useState<string | null>(null);
  const { data: bancos } = useBancos();
  const conBanco = medio === 'transferencia' || medio === 'echeq' || medio === 'cheque';
  const pagar = async () => {
    setError(null);
    try {
      await api(`/gastos/${id}/pagar`, { method: 'POST', body: { medio, bancoId: conBanco ? bancoId : null } });
      await qc.invalidateQueries();
      onCerrar();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo marcar pagado'); }
  };
  useEffect(() => {
    if (!g?.comprobanteId) return;
    let url = '';
    apiBlobUrl(`/archivos/${g.comprobanteId}`).then((u) => { url = u; setFoto(u); }).catch(() => setFoto(null));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [g?.comprobanteId]);

  if (!g) return <Dialogo titulo="Egreso" onCerrar={onCerrar}><Cargando /></Dialogo>;
  const anular = async () => {
    try {
      await api(`/gastos/${id}/anular`, { method: 'POST', body: { motivo } });
      await qc.invalidateQueries();
      onCerrar();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo anular'); }
  };
  return (
    <Dialogo titulo={`Egreso ${nroTicket(g.numero)}`} onCerrar={onCerrar}>
      {!g.anuladoAt && (g.aPagar ? <Estado nivel={g.vencimiento && g.vencimiento <= hoy() ? 'critico' : 'atencion'}>{g.vencimiento ? `Pendiente de pago · vence ${verFecha(g.vencimiento)}` : 'Pendiente de pago'}</Estado> : <Estado nivel="ok">Pagado</Estado>)}
      {g.anuladoAt && <Aviso>Anulado por {g.anuladoPor}, {verMomento(g.anuladoAt)}: {g.motivoAnulacion}</Aviso>}
      <div className="lectura"><span>{g.descripcion}</span><span className="cifra">{formatPesos(g.monto)}</span></div>
      <dl className="resumen">
        <dt>Fecha</dt><dd>{verFecha(g.fecha)}</dd>
        <dt>Categoría</dt><dd>{g.categoria}</dd>
        {g.empleado && <><dt>A</dt><dd>{g.empleado}</dd></>}
        {g.beneficiario && <><dt>Beneficiario</dt><dd>{g.beneficiario}</dd></>}
        {g.medio && <><dt>Forma de pago</dt><dd>{LABEL_MEDIO_GASTO[g.medio]}{g.banco ? ` · ${g.banco}` : ''}{g.pagadoAt ? ` · pagado ${verMomento(g.pagadoAt)} por ${g.pagadoPor}` : ''}</dd></>}
        {g.montoUsd && <><dt>En dólares</dt><dd>US$ {(g.montoUsd / 100).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</dd></>}
        <dt>Comprobante</dt><dd>{g.conFactura ? `Con factura${g.nroFactura ? ` · ${g.nroFactura}` : ''}` : g.nroFactura ?? 'Sin factura'}</dd>
        {g.notas && <><dt>Observaciones</dt><dd>{g.notas}</dd></>}
        <dt>Registrado por</dt><dd>{g.cargadoPor}, {verMomento(g.cargadoAt)}</dd>
      </dl>
      {foto && <a href={foto} target="_blank" rel="noreferrer"><img src={foto} alt="Comprobante" style={{ width: '100%', borderRadius: 12, background: '#fff' }} /></a>}
      {pagando && (
        <>
          <Campo etiqueta="Forma de pago"><Opciones columnas valor={medio} onChange={setMedio} opciones={MEDIOS_GASTO.map((m) => ({ valor: m, titulo: LABEL_MEDIO_GASTO[m] }))} /></Campo>
          {conBanco && <Campo etiqueta="Banco"><Opciones columnas valor={bancoId} onChange={setBancoId} opciones={(bancos ?? []).filter((b) => b.activo).map((b) => ({ valor: b.id, titulo: b.nombre }))} /></Campo>}
        </>
      )}
      {anulando && <Campo etiqueta="Motivo de la anulación"><textarea className="entrada" value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus /></Campo>}
      <Aviso>{error}</Aviso>
      <div className="acciones">
        {!g.anuladoAt && puede('gastos', 3) && (anulando
          ? <button className="boton peligro" disabled={motivo.trim().length < 3} onClick={anular}>Anular egreso</button>
          : <button className="boton fantasma" onClick={() => setAnulando(true)}><Ban size={16} aria-hidden /> Anular</button>)}
        {!g.anuladoAt && g.aPagar && puede('gastos', 2) && (pagando
          ? <button className="boton primario" disabled={!medio || (medio !== 'transferencia' && conBanco && !bancoId)} onClick={pagar}>Confirmar pago</button>
          : <button className="boton primario" onClick={() => setPagando(true)}>Marcar pagado</button>)}
        {!(g.aPagar && !g.anuladoAt) && <button className="boton primario" onClick={onCerrar}>Listo</button>}
      </div>
    </Dialogo>
  );
}
