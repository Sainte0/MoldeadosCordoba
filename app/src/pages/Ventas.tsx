import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ScanLine } from 'lucide-react';
import { formatPesos, plural } from '@moldeados/shared/base';
import { api, nroTicket, useSesion, verFecha } from '../api';
import { useDemorado, useFiltros } from '../filtros';
import { BotonExportar } from './Exportar';
import { Buscador, Cabecera, Cargando, Entrada } from '../ui';

interface VentaFila { id: string; numero: number; fecha: string; total: number; conFactura: boolean; retira: string | null; anuladoAt: string | null; cliente: string; palets: number; maples: number }

export function Ventas() {
  const { puede } = useSesion();
  const [f, setF] = useFiltros({ desde: '', hasta: '', q: '' });
  const { desde, hasta } = f;
  const q = useDemorado(f.q);
  const { data, isLoading } = useQuery({ queryKey: ['ventas', desde, hasta, q], queryFn: () => api<VentaFila[]>(`/ventas?desde=${desde}&hasta=${hasta}&q=${encodeURIComponent(q)}`) });
  const vigentes = (data ?? []).filter((v) => !v.anuladoAt);

  return (
    <div className="ancho">
      <Cabecera titulo="Ventas" bajada="Cada despacho de palets, a quién y quién se lo llevó.">
        {puede('ventas', 2) && <Link to="/ventas/nueva" className="boton primario grande"><ScanLine size={20} aria-hidden /> Despachar palets</Link>}
      </Cabecera>
      <div style={{ marginBottom: 12 }}><Buscador placeholder="Buscar cliente, n.º de remito, quién retiró o patente" value={f.q} onChange={(e) => setF({ q: e.target.value })} aria-label="Buscar ventas" /></div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <label className="campo"><span>Desde</span><Entrada type="date" value={desde} onChange={(e) => setF({ desde: e.target.value })} /></label>
        <label className="campo"><span>Hasta</span><Entrada type="date" value={hasta} onChange={(e) => setF({ hasta: e.target.value })} /></label>
        <div style={{ alignSelf: 'end' }}><BotonExportar que="ventas" desde={desde} hasta={hasta} /></div>
      </div>
      {isLoading ? <Cargando /> : !data?.length ? <div className="hoja vacio"><p>No hay ventas {desde || hasta || q ? 'con estos filtros' : 'todavía'}.</p></div> : (
        <>
          <p className="tenue chico" style={{ marginBottom: 8 }}>{vigentes.reduce((a, v) => a + v.maples, 0).toLocaleString('es-AR')} maples · {formatPesos(vigentes.reduce((a, v) => a + v.total, 0))} sin contar anuladas</p>
          <div className="hoja filas">
            {data.map((v) => (
              <Link key={v.id} to={`/ventas/${v.numero}`} className={`fila${v.anuladoAt ? ' anulada' : ''}`}>
                <div>
                  <div className="principal">{v.cliente}</div>
                  <div className="chico tenue">{verFecha(v.fecha)} · Remito {nroTicket(v.numero)} {v.maples > 0 ? ` · ${plural(v.palets, 'palet', 'palets')}, ${plural(v.maples, 'maple', 'maples')}` : ''}{v.retira ? ` · retiró ${v.retira}` : ''}</div>
                </div>
                <div className="derecha">
                  <div className="cifra">{formatPesos(v.total)}</div>
                  {v.anuladoAt ? <span className="marca-texto peligro">Anulada</span> : <span className={`marca-texto ${v.conFactura ? 'ok' : ''}`}>{v.conFactura ? 'Con factura' : 'Sin factura'}</span>}
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
