import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, Scale } from 'lucide-react';
import { formatPesos } from '@moldeados/shared';
import { api, nroTicket, useSesion, verFecha } from '../api';
import type { CompraFila } from '../datos';
import { BotonExportar } from './Exportar';
import { Cabecera, Cargando, Entrada, Opciones } from '../ui';

export function Compras() {
  const { puede } = useSesion();
  const [tipo, setTipo] = useState<'' | 'pesaje' | 'compra'>('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [pagina, setPagina] = useState(0);
  const { data, isLoading } = useQuery({
    queryKey: ['compras', tipo, desde, hasta, pagina],
    queryFn: () => api<CompraFila[]>(`/compras?tipo=${tipo}&desde=${desde}&hasta=${hasta}&pagina=${pagina}`),
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

      <div className="hoja relleno" style={{ display: 'grid', gap: 14, marginBottom: 16 }}>
        <Opciones<'' | 'pesaje' | 'compra'> columnas valor={tipo} onChange={(t) => { setTipo(t); setPagina(0); }} opciones={[{ valor: '', titulo: 'Todo' }, { valor: 'pesaje', titulo: 'Pesajes' }, { valor: 'compra', titulo: 'Otras compras' }]} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          <label className="campo"><span>Desde</span><Entrada type="date" value={desde} onChange={(e) => { setDesde(e.target.value); setPagina(0); }} /></label>
          <label className="campo"><span>Hasta</span><Entrada type="date" value={hasta} onChange={(e) => { setHasta(e.target.value); setPagina(0); }} /></label>
          <div style={{ alignSelf: 'end' }}><BotonExportar que="compras" desde={desde} hasta={hasta} /></div>
        </div>
      </div>

      {isLoading ? <Cargando /> : !data?.length ? (
        <div className="hoja vacio"><p>No hay compras {desde || hasta || tipo ? 'con estos filtros' : 'cargadas todavía'}.</p></div>
      ) : (
        <>
          <p className="tenue chico" style={{ marginBottom: 8 }}>{data.length} en esta página · {formatPesos(total)} sin contar anuladas</p>
          <div className="hoja filas">
            {data.map((c) => (
              <Link key={c.id} to={`/compras/${c.id}`} className={`fila${c.anuladaAt ? ' anulada' : ''}`}>
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
            {pagina > 0 && <button className="boton secundario" onClick={() => setPagina(pagina - 1)}>Más nuevas</button>}
            {data.length === 50 && <button className="boton secundario" onClick={() => setPagina(pagina + 1)}>Más viejas</button>}
          </div>
        </>
      )}
    </div>
  );
}
