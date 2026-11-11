import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, Scale } from 'lucide-react';
import { formatPesos } from '@moldeados/shared/base';
import { api, nroTicket, useSesion, verFecha } from '../api';
import { useDemorado, useFiltros } from '../filtros';
import type { CompraFila } from '../datos';
import { BotonExportar } from './Exportar';
import { Buscador, Cabecera, Cargando, Entrada, MasFiltros } from '../ui';

export function Compras() {
  const { puede } = useSesion();
  const [f, setF] = useFiltros({ tipo: '', desde: '', hasta: '', pagina: '0', q: '' });
  const tipo = f.tipo as '' | 'pesaje' | 'compra';
  const { desde, hasta } = f;
  const pagina = Number(f.pagina) || 0;
  const q = useDemorado(f.q);
  const { data, isLoading } = useQuery({
    queryKey: ['compras', tipo, desde, hasta, pagina, q],
    queryFn: () => api<CompraFila[]>(`/compras?tipo=${tipo}&desde=${desde}&hasta=${hasta}&pagina=${pagina}&q=${encodeURIComponent(q)}`),
  });
  const total = (data ?? []).filter((c) => !c.anuladaAt).reduce((a, c) => a + c.total, 0);

  return (
    <div className="ancho">
      <Cabecera titulo="Compras" bajada="Pesajes de cartón y compras de tinta, aglutinante y otros.">
        {puede('compras', 2) && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link to="/pesaje" className="boton secundario"><Scale size={18} aria-hidden /> Pesaje de cartón</Link>
            <Link to="/compras/nueva" className="boton primario"><Plus size={18} aria-hidden /> Nueva compra</Link>
          </div>
        )}
      </Cabecera>

      <div style={{ display: 'grid', gap: 10, marginBottom: 12 }}>
        <Buscador placeholder="Buscar proveedor, n.º de ticket, factura o patente" value={f.q} onChange={(e) => setF({ q: e.target.value, pagina: '0' })} aria-label="Buscar compras" />
        <div className="pestanas" role="group" aria-label="Qué mostrar">
          {([['', 'Todo'], ['pesaje', 'Pesajes de cartón'], ['compra', 'Otras compras']] as const).map(([k, l]) => <button key={k} type="button" aria-pressed={tipo === k} onClick={() => setF({ tipo: k, pagina: '0' })}>{l}</button>)}
        </div>
        <MasFiltros activos={[desde, hasta].filter(Boolean).length}>
          <label className="campo"><span>Desde</span><Entrada type="date" value={desde} onChange={(e) => setF({ desde: e.target.value, pagina: '0' })} /></label>
          <label className="campo"><span>Hasta</span><Entrada type="date" value={hasta} onChange={(e) => setF({ hasta: e.target.value, pagina: '0' })} /></label>
          <div style={{ alignSelf: 'end' }}><BotonExportar que="compras" desde={desde} hasta={hasta} /></div>
        </MasFiltros>
      </div>

      {isLoading ? <Cargando /> : !data?.length ? (
        <div className="hoja vacio"><p>No hay compras {desde || hasta || tipo ? 'con estos filtros' : 'cargadas todavía'}.</p></div>
      ) : (
        <>
          <p className="tenue chico" style={{ marginBottom: 8 }}>{data.length} en esta página · {formatPesos(total)} sin contar anuladas</p>
          <div className="hoja filas">
            {data.map((c) => (
              <Link key={c.id} to={`/compras/${c.numero}`} className={`fila${c.anuladaAt ? ' anulada' : ''}`}>
                <div>
                  <div className="principal">{c.proveedor}</div>
                  <div className="chico tenue">{verFecha(c.fecha)} · {c.tipo === 'pesaje' ? 'Ticket' : 'Compra'} {nroTicket(c.numero)} · {c.resumen}</div>
                </div>
                <div className="derecha">
                  <div className="cifra">{formatPesos(c.total)}</div>
                  {c.anuladaAt ? <span className="marca-texto peligro">Anulada</span> : <span className={`marca-texto ${c.conFactura ? 'ok' : ''}`}>{c.conFactura ? 'Con factura' : 'Sin factura'}</span>}
                </div>
              </Link>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            {pagina > 0 && <button className="boton secundario" onClick={() => setF({ pagina: String(pagina - 1) })}>Más nuevas</button>}
            {data.length === 50 && <button className="boton secundario" onClick={() => setF({ pagina: String(pagina + 1) })}>Más viejas</button>}
          </div>
        </>
      )}
    </div>
  );
}
