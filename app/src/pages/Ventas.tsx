import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Truck } from 'lucide-react';
import { formatPesos, plural } from '@moldeados/shared/base';
import { api, nroTicket, useSesion, verFecha } from '../api';
import { useDemorado, useFiltros } from '../filtros';
import { BotonExportar } from './Exportar';
import { Buscador, Cabecera, Cargando, Entrada, MasFiltros } from '../ui';

/** "25 nov" en el año; "28 sept 2025" si es de otro año. */
const fechaLista = (f: string) => {
  const d = new Date(`${f}T12:00:00-03:00`);
  const otroAnio = f.slice(0, 4) !== new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).slice(0, 4);
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', ...(otroAnio ? { year: 'numeric' } : {}), timeZone: 'America/Argentina/Buenos_Aires' }).replace('.', '').replace(/ de /g, ' ');
};

interface VentaFila { id: string; numero: number; fecha: string; total: number; conFactura: boolean; retira: string | null; anuladoAt: string | null; cliente: string; palets: number; maples: number; segunda: boolean; cobro: { cobrado: number; debe: number } | null; firmado: boolean; ordenId: string | null }

export function Ventas() {
  const { puede } = useSesion();
  const [f, setF] = useFiltros({ desde: '', hasta: '', q: '', cobro: '', cuenta: '1' });
  const { desde, hasta } = f;
  const q = useDemorado(f.q);
  const { data, isLoading } = useQuery({ queryKey: ['ventas', desde, hasta, q, f.cobro, f.cuenta], queryFn: () => api<VentaFila[]>(`/ventas?desde=${desde}&hasta=${hasta}&q=${encodeURIComponent(q)}&cobro=${f.cobro}&cuenta=${f.cuenta}`) });
  const vigentes = (data ?? []).filter((v) => !v.anuladoAt);

  return (
    <div className="ancho">
      <Cabecera titulo={f.cuenta === '2' ? 'Cuenta 2' : 'Ventas'} bajada="Cada venta con su remito: a quién, cuánto, quién se lo llevó y si está cobrada.">
        {puede('ventas', 3) && <Link to="/ordenes/nueva" className="boton primario grande"><Truck size={20} aria-hidden /> Orden de venta</Link>}
      </Cabecera>
      {/* Cuenta 2 es un sector aparte de las ventas. */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div className="pestanas" role="group" aria-label="Cuenta">
          <button aria-pressed={f.cuenta !== '2'} onClick={() => setF({ cuenta: '1' })}>Cuenta 1</button>
          <button aria-pressed={f.cuenta === '2'} onClick={() => setF({ cuenta: '2' })}>Cuenta 2</button>
        </div>
        <div className="pestanas" role="group" aria-label="Estado de cobro">
          <button aria-pressed={f.cobro !== 'pendientes'} onClick={() => setF({ cobro: '' })}>Todas</button>
          <button aria-pressed={f.cobro === 'pendientes'} onClick={() => setF({ cobro: 'pendientes' })}>Sin cobrar</button>
        </div>
      </div>
      <div style={{ marginBottom: 12 }}><Buscador placeholder="Buscar cliente, n.º de remito, quién retiró o patente" value={f.q} onChange={(e) => setF({ q: e.target.value })} aria-label="Buscar ventas" /></div>
      <div style={{ marginBottom: 12 }}>
        <MasFiltros activos={[desde, hasta].filter(Boolean).length}>
          <label className="campo"><span>Desde</span><Entrada type="date" value={desde} onChange={(e) => setF({ desde: e.target.value })} /></label>
          <label className="campo"><span>Hasta</span><Entrada type="date" value={hasta} onChange={(e) => setF({ hasta: e.target.value })} /></label>
          <div style={{ alignSelf: 'end' }}><BotonExportar que="ventas" desde={desde} hasta={hasta} /></div>
        </MasFiltros>
      </div>
      {isLoading ? <Cargando /> : !data?.length ? <div className="hoja vacio"><p>{f.cobro === 'pendientes' ? 'No hay ventas pendientes de cobro.' : `No hay ventas ${desde || hasta || q ? 'con estos filtros' : 'todavía'}.`}</p></div> : (
        <>
          <p className="tenue chico" style={{ marginBottom: 8 }}>{vigentes.reduce((a, v) => a + v.maples, 0).toLocaleString('es-AR')} maples · {formatPesos(vigentes.reduce((a, v) => a + v.total, 0))} vendido{((d) => (d > 0 ? ` · ${formatPesos(d)} pendiente de cobro` : ''))(vigentes.reduce((a, v) => a + (v.cobro?.debe ?? 0), 0))}</p>
          <div className="hoja filas">
            {data.map((v) => (
              <Link key={v.id} to={`/ventas/${v.numero}`} className={`fila${v.anuladoAt ? ' anulada' : ''}`}>
                <div>
                  <div className="principal">{v.cliente}</div>
                  <div className="chico tenue">{fechaLista(v.fecha)}{v.maples > 0 ? ` · ${plural(v.maples, 'maple', 'maples')}` : ''}{v.segunda ? ' · segunda' : ''}</div>
                  <div className="chico tenue">Remito {nroTicket(v.numero)}{v.retira ? ` · ${v.retira}` : ''}</div>
                </div>
                <div className="derecha" style={{ display: 'grid', gap: 4, justifyItems: 'end' }}>
                  <div className="cifra">{formatPesos(v.total)}</div>
                  {/* Solo se marca lo que pide atención: cobrada es lo normal y no lleva marca. */}
                  {v.anuladoAt ? <span className="marca-texto peligro">Anulada</span>
                    : !v.cobro || v.cobro.debe <= 0 ? null
                    : v.cobro.cobrado > 0 ? <span className="marca-texto alerta">Debe {formatPesos(v.cobro.debe)}</span>
                    : <span className="marca-texto alerta">Sin cobrar</span>}
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
