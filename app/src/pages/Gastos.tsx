import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, CheckCircle2, Paperclip, Plus } from 'lucide-react';
import { formatPesos, LABEL_MEDIO_GASTO, type MedioGasto } from '@moldeados/shared';
import { api, apiBlobUrl, nroTicket, useSesion, verFecha, verMomento } from '../api';
import { useCategoriasGasto } from '../datos';
import { Aviso, Cabecera, Campo, Cargando, Dialogo, Entrada, Opciones } from '../ui';

interface GastoFila { id: string; numero: number; fecha: string; descripcion: string; monto: number; medio: MedioGasto; conFactura: boolean; comprobanteId: string | null; anuladoAt: string | null; categoria: string; empleado: string | null; cargadoPor: string }

const inicioMes = () => { const h = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date()); return h.slice(0, 8) + '01'; };

export function Gastos() {
  const { puede } = useSesion();
  const [params] = useSearchParams();
  const { data: categorias } = useCategoriasGasto();
  const [desde, setDesde] = useState(inicioMes());
  const [hasta, setHasta] = useState('');
  const [categoriaId, setCategoriaId] = useState<string>('');
  const { data, isLoading } = useQuery({ queryKey: ['gastos', desde, hasta, categoriaId], queryFn: () => api<GastoFila[]>(`/gastos?desde=${desde}&hasta=${hasta}&categoriaId=${categoriaId}`) });
  const [viendo, setViendo] = useState<string | null>(null);
  const vigentes = (data ?? []).filter((g) => !g.anuladoAt);

  return (
    <div className="ancho" style={{ display: 'grid', gap: 20 }}>
      <Cabecera titulo="Gastos" bajada="Lo que se paga en el día a día: caja chica, impuestos, servicios, sueldos.">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {puede('gastos', 2) && <Link to="/gastos/nuevo" className="boton primario"><Plus size={18} aria-hidden /> Cargar gasto</Link>}
        </div>
      </Cabecera>
      {params.get('nuevo') && <div className="aviso ok" style={{ display: 'flex', gap: 10, alignItems: 'center' }}><CheckCircle2 size={22} aria-hidden /> Gasto guardado.</div>}

      <div className="hoja relleno" style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          <label className="campo"><span>Desde</span><Entrada type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></label>
          <label className="campo"><span>Hasta</span><Entrada type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></label>
        </div>
        <Opciones columnas valor={categoriaId} onChange={setCategoriaId} opciones={[{ valor: '', titulo: 'Todas' }, ...(categorias ?? []).map((c) => ({ valor: c.id, titulo: c.nombre }))]} />
      </div>

      {isLoading ? <Cargando /> : !data?.length ? <div className="hoja vacio"><p>No hay gastos con estos filtros.</p></div> : (
        <>
          <div className="lectura"><span>{vigentes.length} gastos</span><span className="cifra">{formatPesos(vigentes.reduce((a, g) => a + g.monto, 0))}</span></div>
          <div className="hoja filas">
            {data.map((g) => (
              <button key={g.id} className={`fila${g.anuladoAt ? ' anulada' : ''}`} onClick={() => setViendo(g.id)}>
                <div>
                  <div className="principal">{g.descripcion}{g.empleado ? ` · ${g.empleado}` : ''}</div>
                  <div className="chico tenue">{verFecha(g.fecha)} · {g.categoria} · {LABEL_MEDIO_GASTO[g.medio]}</div>
                </div>
                <div className="derecha">
                  <div className="cifra">{formatPesos(g.monto)}</div>
                  <span className="chico tenue" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>{g.comprobanteId && <Paperclip size={14} aria-label="Con comprobante" />}{g.anuladoAt ? 'Anulado' : g.conFactura ? 'Con factura' : 'Sin factura'}</span>
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

interface Detalle extends GastoFila { banco: string | null; nroFactura: string | null; notas: string | null; cargadoAt: string; motivoAnulacion: string | null; anuladoPor: string | null }

function DetalleGasto({ id, onCerrar }: { id: string; onCerrar: () => void }) {
  const { puede } = useSesion();
  const qc = useQueryClient();
  const { data: g } = useQuery({ queryKey: ['gasto', id], queryFn: () => api<Detalle>(`/gastos/${id}`) });
  const [foto, setFoto] = useState<string | null>(null);
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!g?.comprobanteId) return;
    let url = '';
    apiBlobUrl(`/archivos/${g.comprobanteId}`).then((u) => { url = u; setFoto(u); }).catch(() => setFoto(null));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [g?.comprobanteId]);

  if (!g) return <Dialogo titulo="Gasto" onCerrar={onCerrar}><Cargando /></Dialogo>;
  const anular = async () => {
    try {
      await api(`/gastos/${id}/anular`, { method: 'POST', body: { motivo } });
      await qc.invalidateQueries();
      onCerrar();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo anular'); }
  };
  return (
    <Dialogo titulo={`Gasto ${nroTicket(g.numero)}`} onCerrar={onCerrar}>
      {g.anuladoAt && <Aviso>Anulado por {g.anuladoPor}, {verMomento(g.anuladoAt)}: {g.motivoAnulacion}</Aviso>}
      <div className="lectura"><span>{g.descripcion}</span><span className="cifra">{formatPesos(g.monto)}</span></div>
      <dl className="resumen">
        <dt>Fecha</dt><dd>{verFecha(g.fecha)}</dd>
        <dt>Categoría</dt><dd>{g.categoria}</dd>
        {g.empleado && <><dt>A</dt><dd>{g.empleado}</dd></>}
        <dt>Pagado con</dt><dd>{LABEL_MEDIO_GASTO[g.medio]}{g.banco ? ` · ${g.banco}` : ''}</dd>
        <dt>Factura</dt><dd>{g.conFactura ? `Sí${g.nroFactura ? ` · ${g.nroFactura}` : ''}` : 'No'}</dd>
        <dt>Cargado por</dt><dd>{g.cargadoPor}, {verMomento(g.cargadoAt)}</dd>
      </dl>
      {foto && <a href={foto} target="_blank" rel="noreferrer"><img src={foto} alt="Comprobante" style={{ width: '100%', borderRadius: 12, background: '#fff' }} /></a>}
      {anulando && <Campo etiqueta="Motivo de la anulación"><textarea className="entrada" value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus /></Campo>}
      <Aviso>{error}</Aviso>
      <div className="acciones">
        {!g.anuladoAt && puede('gastos', 3) && (anulando
          ? <button className="boton peligro" disabled={motivo.trim().length < 3} onClick={anular}>Anular gasto</button>
          : <button className="boton fantasma" onClick={() => setAnulando(true)}><Ban size={16} aria-hidden /> Anular</button>)}
        <button className="boton primario" onClick={onCerrar}>Listo</button>
      </div>
    </Dialogo>
  );
}
