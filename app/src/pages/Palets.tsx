import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Factory, Layers } from 'lucide-react';
import { LABEL_VEHICULO, type Vehiculo } from '@moldeados/shared/base';
import { api, nroTicket, useSesion, verMomento } from '../api';
import { useDemorado, useFiltros } from '../filtros';
import { useStockMaples } from '../datos';
import { Muestra } from '../MapleVista';
import { BotonExportar } from './Exportar';
import { Buscador, Cabecera, Cargando } from '../ui';
import { Estado } from '../Estado';

interface PaletFila { suelto: boolean; ventaId: string | null; remito: number | null; cliente: string | null; id: string; numero: number; paquetes: number; ancho: number; largo: number; alto: number; vehiculo: Vehiculo | null; destino: string | null; armadoAt: string; anuladoAt: string | null; codigo: string; variante: string; colorHex: string | null }

export function Palets() {
  const { puede } = useSesion();
  const { data: stock } = useStockMaples();
  // Por defecto, lo que importa en esta pantalla: lo que está listo para despachar.
  const [f, setF] = useFiltros({ estado: 'listos', q: '' });
  const q = useDemorado(f.q);
  const { data: palets, isLoading } = useQuery({ queryKey: ['palets', f.estado, q], queryFn: () => api<PaletFila[]>(`/palets?estado=${f.estado}&q=${encodeURIComponent(q)}`) });

  return (
    <div className="ancho" style={{ display: 'grid', gap: 28 }}>
      <Cabecera titulo="Stock y palets" bajada="Paquetes de 60 hechos, cuántos ya están en palets y cuántos quedan sueltos.">
        {puede('produccion', 2) && <Link to="/palets/nuevo" className="boton primario"><Layers size={18} aria-hidden /> Armar palet</Link>}
      </Cabecera>

      <StockMaples stock={stock} />

      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <h3>Palets armados</h3><BotonExportar que="palets" />
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <div className="pestanas" role="group" aria-label="Estado">
            {([['listos', 'Listos para salir'], ['vendidos', 'Vendidos'], ['', 'Todos']] as const).map(([v, t]) => <button key={v} aria-pressed={f.estado === v} onClick={() => setF({ estado: v })}>{t}</button>)}
          </div>
          <div style={{ flex: 1, minWidth: 220 }}><Buscador placeholder="Buscar n.º de palet, código o cliente" value={f.q} onChange={(e) => setF({ q: e.target.value })} aria-label="Buscar palets" /></div>
        </div>
        {isLoading ? <Cargando /> : !palets?.length ? <div className="hoja vacio"><p>{f.q ? 'No hay palets con esa búsqueda.' : f.estado === 'listos' ? 'No hay palets listos para salir. Se arman desde "Armar palet".' : f.estado === 'vendidos' ? 'Todavía no se vendió ningún palet.' : 'Todavía no se armó ningún palet.'}</p></div> : (
          <div className="hoja filas">
            {palets.map((p) => (
              <Link key={p.id} to={`/palets/${p.numero}`} className={`fila${p.anuladoAt ? ' anulada' : ''}`}>
                <div className="con-muestra">
                  <Muestra color={p.colorHex} />
                  <div>
                    <div className="principal">{p.suelto ? `${p.paquetes} paquetes sueltos` : `Palet ${nroTicket(p.numero)}`} · {p.codigo}</div>
                    <div className="chico tenue">{p.ventaId ? `Vendido a ${p.cliente} · remito ${nroTicket(p.remito ?? 0)}` : `${p.suelto ? '' : `${p.ancho}×${p.largo}×${p.alto} · `}${p.destino ? `para ${p.destino} · ` : ''}armado ${verMomento(p.armadoAt)}`}</div>
                  </div>
                </div>
                <div className="derecha"><div className="cifra">{p.paquetes} paq.</div>{p.anuladoAt ? <span className="marca-texto">Desarmado</span> : p.ventaId ? <span className="marca-texto">Vendido</span> : <Estado nivel="ok">Listo para salir</Estado>}</div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

type Fila = NonNullable<ReturnType<typeof useStockMaples>['data']>[number];

/**
 * Stock por código, con lo que significa y qué hacer: cuánto hay (listo en palets y sin paletizar), cuánto piden los
 * pedidos sin entregar y si alcanza. Lo urgente primero: lo que falta para pedidos, en rojo.
 */
function StockMaples({ stock }: { stock: Fila[] | undefined }) {
  const { puede } = useSesion();
  if (!stock) return <section className="hoja relleno"><Cargando /></section>;
  const filas = stock.filter((s) => s.activo || s.producido - s.vendido > 0).map((s) => {
    const enPlanta = s.producido - s.vendido;
    const listos = s.enPalets - s.vendido;
    const sueltos = s.producido - s.enPalets;
    const falta = Math.max(0, s.comprometido - enPlanta);
    // Orden: falta para pedidos > sin stock con pedidos > hay para paletizar > hay stock > sin stock y sin pedidos.
    const orden = falta > 0 ? 0 : enPlanta <= 0 && s.comprometido > 0 ? 1 : sueltos > 0 ? 2 : enPlanta > 0 ? 3 : 4;
    return { ...s, enPlanta, listos, sueltos, falta, orden };
  }).sort((a, b) => a.orden - b.orden || b.falta - a.falta || b.enPlanta - a.enPlanta);
  const faltan = filas.filter((f) => f.falta > 0).length;
  const sinStock = filas.filter((f) => f.enPlanta <= 0).length;

  return (
    <section className="hoja">
      <div className="fila">
        <div style={{ flex: 1 }}>
          <h3>Stock de maples</h3>
          <p className="chico tenue">En paquetes de 60. {faltan ? `${faltan === 1 ? '1 código no alcanza' : `${faltan} códigos no alcanzan`} para los pedidos.` : sinStock ? `${sinStock === 1 ? '1 código' : `${sinStock} códigos`} sin stock, sin pedidos pendientes.` : 'Todo con stock.'}</p>
        </div>
        {sinStock > 0 && !faltan && puede('produccion', 2) && <Link to="/produccion/nuevo" className="boton secundario chico-boton"><Factory size={16} aria-hidden /> Cargar parte</Link>}
      </div>
      {filas.map((s) => (
        <div className="fila stock-maple" key={s.id}>
          <div className="con-muestra">
            <Muestra color={s.colorHex} grande />
            <div>
              <div className="principal">{s.codigo} <span className="tenue" style={{ fontWeight: 400 }}>{s.nombre}</span></div>
              <div className="chico tenue">
                {s.enPlanta > 0 ? `${s.listos.toLocaleString('es-AR')} listos en palets · ${s.sueltos.toLocaleString('es-AR')} sin paletizar` : 'No hay paquetes en planta'}
                {s.comprometido > 0 && ` · pedidos sin entregar: ${s.comprometido.toLocaleString('es-AR')}`}
              </div>
              <div className="acciones-stock">
                {s.falta > 0 && puede('produccion', 2) && <Link to="/produccion/nuevo" className="boton secundario chico-boton"><Factory size={16} aria-hidden /> Cargar parte</Link>}
                {s.sueltos > 0 && puede('produccion', 2) && <Link to="/palets/nuevo" className="boton secundario chico-boton"><Layers size={16} aria-hidden /> Armar palet</Link>}
                {s.comprometido > 0 && puede('ventas') && <Link to="/pedidos" className="boton fantasma chico-boton"><ClipboardList size={16} aria-hidden /> Ver pedidos</Link>}
              </div>
            </div>
          </div>
          <div className="derecha">
            <div className="cifra" style={{ fontSize: '1.5rem' }}>{Math.max(0, s.enPlanta).toLocaleString('es-AR')}</div>
            {s.falta > 0 ? <Estado nivel="critico">Faltan {s.falta.toLocaleString('es-AR')} para pedidos</Estado>
              : s.enPlanta <= 0 ? (s.comprometido > 0 ? <Estado nivel="critico">Sin stock</Estado> : <span className="marca-texto">Sin stock</span>)
              : s.sueltos > 0 ? <Estado nivel="atencion">{s.sueltos.toLocaleString('es-AR')} para paletizar</Estado>
              : <Estado nivel="ok">Listo para despachar</Estado>}
          </div>
        </div>
      ))}
      {!filas.length && <p className="tenue" style={{ padding: '0 18px 18px' }}>No hay códigos de maple cargados. Se crean en Ajustes › Maples y máquinas.</p>}
    </section>
  );
}
