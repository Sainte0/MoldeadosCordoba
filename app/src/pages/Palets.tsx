import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Layers } from 'lucide-react';
import { LABEL_VEHICULO, type Vehiculo } from '@moldeados/shared/base';
import { api, nroTicket, useSesion, verMomento } from '../api';
import { useDemorado, useFiltros } from '../filtros';
import { useStockMaples } from '../datos';
import { Muestra } from '../MapleVista';
import { BotonExportar } from './Exportar';
import { Buscador, Cabecera, Cargando } from '../ui';

interface PaletFila { ventaId: string | null; id: string; numero: number; paquetes: number; ancho: number; largo: number; alto: number; vehiculo: Vehiculo | null; destino: string | null; armadoAt: string; anuladoAt: string | null; codigo: string; variante: string; colorHex: string | null }

export function Palets() {
  const { puede } = useSesion();
  const { data: stock } = useStockMaples();
  const [f, setF] = useFiltros({ estado: '', q: '' });
  const q = useDemorado(f.q);
  const { data: palets, isLoading } = useQuery({ queryKey: ['palets', f.estado, q], queryFn: () => api<PaletFila[]>(`/palets?estado=${f.estado}&q=${encodeURIComponent(q)}`) });

  return (
    <div className="ancho" style={{ display: 'grid', gap: 28 }}>
      <Cabecera titulo="Stock y palets" bajada="Paquetes de 60 hechos, cuántos ya están en palets y cuántos quedan sueltos.">
        {puede('produccion', 2) && <Link to="/palets/nuevo" className="boton primario"><Layers size={18} aria-hidden /> Armar palet</Link>}
      </Cabecera>

      <section className="hoja">
        <div className="fila"><h3>Stock de maples</h3><span className="chico tenue">en paquetes</span></div>
        {stock?.filter((s) => s.activo || s.producido > 0).map((s) => (
          <div className="fila" key={s.id}>
            <div className="con-muestra">
              <Muestra color={s.colorHex} grande />
              <div><div className="principal">{s.codigo}</div><div className="chico tenue">{s.nombre} · {s.enPalets - s.vendido} en palets listos · {s.vendido} vendidos</div></div>
            </div>
            <div className="derecha">
              <div className="cifra" style={{ fontSize: '1.5rem' }}>{(s.producido - s.enPalets).toLocaleString('es-AR')}</div>
              <div className="chico tenue">sueltos de {(s.producido - s.vendido).toLocaleString('es-AR')} en planta</div>
            </div>
          </div>
        ))}
      </section>

      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <h3>Palets armados</h3><BotonExportar que="palets" />
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <div className="pestanas" role="group" aria-label="Estado">
            {([['', 'Todos'], ['listos', 'Listos para salir'], ['vendidos', 'Vendidos']] as const).map(([v, t]) => <button key={v} aria-pressed={f.estado === v} onClick={() => setF({ estado: v })}>{t}</button>)}
          </div>
          <div style={{ flex: 1, minWidth: 220 }}><Buscador placeholder="Buscar n.º de palet, código o cliente" value={f.q} onChange={(e) => setF({ q: e.target.value })} aria-label="Buscar palets" /></div>
        </div>
        {isLoading ? <Cargando /> : !palets?.length ? <div className="hoja vacio"><p>{f.q || f.estado ? 'No hay palets con estos filtros.' : 'Todavía no se armó ningún palet.'}</p></div> : (
          <div className="hoja filas">
            {palets.map((p) => (
              <Link key={p.id} to={`/palets/${p.id}`} className={`fila${p.anuladoAt ? ' anulada' : ''}`}>
                <div className="con-muestra">
                  <Muestra color={p.colorHex} />
                  <div>
                    <div className="principal">Palet {nroTicket(p.numero)} · {p.codigo}</div>
                    <div className="chico tenue">{p.ancho}×{p.largo}×{p.alto}{p.vehiculo ? ` · ${LABEL_VEHICULO[p.vehiculo]}` : ''}{p.destino ? ` · ${p.destino}` : ''} · {verMomento(p.armadoAt)}</div>
                  </div>
                </div>
                <div className="derecha"><div className="cifra">{p.paquetes} paq.</div>{p.anuladoAt ? <span className="marca-texto peligro">Anulado</span> : p.ventaId ? <span className="marca-texto">Vendido</span> : <span className="marca-texto ok">Listo para salir</span>}</div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
