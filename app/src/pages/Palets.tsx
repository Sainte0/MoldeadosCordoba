import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Layers, QrCode } from 'lucide-react';
import type { Vehiculo } from '@moldeados/shared/base';
import { api, hoy, nroTicket, useSesion, verMomento } from '../api';
import { useDemorado, useFiltros } from '../filtros';
import { useStockPallets } from './Plastificar';
import { EnLaFabrica } from './Planilla';
import { Muestra } from '../MapleVista';
import { BotonExportar } from './Exportar';
import { Buscador, Cabecera, Cargando } from '../ui';
import { Estado } from '../Estado';

interface PaletFila { suelto: boolean; ventaId: string | null; remito: number | null; cliente: string | null; id: string; numero: number; paquetes: number; ancho: number; largo: number; alto: number; vehiculo: Vehiculo | null; destino: string | null; armadoAt: string; anuladoAt: string | null; codigo: string; variante: string; colorHex: string | null; maplesPorPaquete: number }

export function Palets() {
  const { puede } = useSesion();
  const { data: stock } = useStockPallets();
  // Por defecto, lo que importa en esta pantalla: lo que está listo para despachar.
  const [f, setF] = useFiltros({ estado: 'listos', q: '' });
  const q = useDemorado(f.q);
  const { data: palets, isLoading } = useQuery({ queryKey: ['palets', f.estado, q], queryFn: () => api<PaletFila[]>(`/palets?estado=${f.estado}&q=${encodeURIComponent(q)}`) });

  return (
    <div className="ancho" style={{ display: 'grid', gap: 18 }}>
      <Cabecera titulo="Stock de pallets" bajada="Lo que hay en la fábrica por tipo y alto. Cada pallet entra al terminar de plastificarlo.">
        <div className="acciones-titulo">
          <Link to="/escanear" className="boton secundario solo-escritorio"><QrCode size={18} aria-hidden /> Escanear</Link>
          {puede('produccion', 2) && <Link to="/plastificar" className="boton primario"><Layers size={18} aria-hidden /> Pallet terminado</Link>}
        </div>
      </Cabecera>

      {stock ? <EnLaFabrica stock={stock} /> : <Cargando />}

      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <h3>Pallets</h3><span className="solo-escritorio"><BotonExportar que="palets" /></span>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <div className="pestanas" role="group" aria-label="Estado">
            {([['listos', 'Listos para salir'], ['vendidos', 'Vendidos'], ['', 'Todos']] as const).map(([v, t]) => <button key={v} aria-pressed={f.estado === v} onClick={() => setF({ estado: v })}>{t}</button>)}
          </div>
          <div style={{ flex: 1, minWidth: 220 }}><Buscador placeholder="Buscar n.º de pallet, maple o cliente" value={f.q} onChange={(e) => setF({ q: e.target.value })} aria-label="Buscar pallets" /></div>
        </div>
        {isLoading ? <Cargando /> : !palets?.length ? <div className="hoja vacio"><p>{f.q ? 'No hay pallets con esa búsqueda.' : f.estado === 'listos' ? 'No hay pallets en la fábrica. Entran desde "Pallet terminado".' : f.estado === 'vendidos' ? 'Todavía no se vendió ningún pallet.' : 'Todavía no se cargó ningún pallet.'}</p></div> : (
          <div className="hoja filas">
            {palets.map((p) => (
              <Link key={p.id} to={`/palets/${p.numero}`} className={`fila${p.anuladoAt ? ' anulada' : ''}`}>
                <div className="con-muestra">
                  <Muestra color={p.colorHex} />
                  <div>
                    <div className="principal">{p.suelto ? `${p.paquetes} paquetes sueltos · ${p.codigo}` : `${p.codigo} de ${p.alto}`}</div>
                    <div className="chico tenue">N.º {nroTicket(p.numero)} · {p.ventaId ? `vendido a ${p.cliente}` : cuando(p.armadoAt)}</div>
                  </div>
                </div>
                <div className="derecha"><div className="cifra">{(p.paquetes * p.maplesPorPaquete).toLocaleString('es-AR')} <small className="tenue">maples</small></div>{p.anuladoAt ? <span className="marca-texto">Anulado</span> : p.ventaId ? (f.estado !== 'vendidos' && <span className="marca-texto">Vendido</span>) : f.estado !== 'listos' && <Estado nivel="ok">En la fábrica</Estado>}</div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/** "hoy 09:27" o "25 nov": lo justo para ubicar el pallet sin que el renglón ocupe dos líneas. */
function cuando(iso: string) {
  const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(iso));
  const [fecha = '', hora = ''] = verMomento(iso).split(', ');
  return dia === hoy() ? `hoy ${hora}` : fecha;
}
