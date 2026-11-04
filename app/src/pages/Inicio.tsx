import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Factory, Layers, Package, Scale, ScanLine, ShoppingCart, Wallet } from 'lucide-react';
import { formatCantidad, formatPesos } from '@moldeados/shared';
import { api, hoy, useSesion } from '../api';
import { useMaterias, useStockMaples, type CompraFila } from '../datos';
import { Muestra } from '../MapleVista';

function saludo(): string {
  const h = Number(new Intl.DateTimeFormat('es-AR', { hour: 'numeric', hour12: false, timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date()));
  return h < 13 ? 'Buen día' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
}

export function Inicio() {
  const { sesion, puede } = useSesion();
  const { data: materias } = useMaterias();
  const { data: maples } = useStockMaples(puede('produccion'));
  const hoyStr = hoy();
  const { data: deHoy } = useQuery({ queryKey: ['compras', 'hoy', hoyStr], queryFn: () => api<CompraFila[]>(`/compras?desde=${hoyStr}&hasta=${hoyStr}`), enabled: puede('compras') });
  const validas = (deHoy ?? []).filter((c) => !c.anuladaAt);

  return (
    <div className="ancho" style={{ display: 'grid', gap: 32 }}>
      <header>
        <h1>{saludo()}, {sesion?.usuario.nombre.split(' ')[0]}</h1>
        <p className="tenue" style={{ marginTop: 6 }}>¿Qué vas a cargar?</p>
      </header>

      <div className="tareas">
        {puede('ventas', 2) && (
          <Link to="/ventas/nueva" className="tarea">
            <span className="ico"><ScanLine size={24} aria-hidden /></span>
            <span><b>Despachar palets</b><small>Se va un camión: escaneá y listo</small></span>
            <ChevronRight aria-hidden />
          </Link>
        )}
        {puede('produccion', 2) && (
          <Link to="/produccion/nuevo" className="tarea">
            <span className="ico"><Factory size={24} aria-hidden /></span>
            <span><b>Parte de producción</b><small>Terminó un turno de máquina</small></span>
            <ChevronRight aria-hidden />
          </Link>
        )}
        {puede('produccion', 2) && (
          <Link to="/palets/nuevo" className="tarea clara">
            <span className="ico"><Layers size={24} aria-hidden /></span>
            <span><b>Armar palet</b><small>Con su etiqueta y QR</small></span>
            <ChevronRight aria-hidden />
          </Link>
        )}
        {puede('compras', 2) && (
          <Link to="/pesaje" className="tarea clara">
            <span className="ico"><Scale size={24} aria-hidden /></span>
            <span><b>Pesaje de cartón</b><small>Llegó un camión a la báscula</small></span>
            <ChevronRight aria-hidden />
          </Link>
        )}
        {puede('cuentas', 2) && (
          <Link to="/dinero/nuevo?tipo=cobro" className="tarea clara">
            <span className="ico"><Wallet size={24} aria-hidden /></span>
            <span><b>Registrar cobro</b><small>Efectivo, transferencia o cheque</small></span>
            <ChevronRight aria-hidden />
          </Link>
        )}
        {puede('compras', 2) && (
          <Link to="/compras/nueva" className="tarea clara">
            <span className="ico"><ShoppingCart size={24} aria-hidden /></span>
            <span><b>Compra de insumos</b><small>Tinta, aglutinante u otros</small></span>
            <ChevronRight aria-hidden />
          </Link>
        )}
      </div>

      {maples && maples.some((m) => m.producido - m.vendido > 0) && (
        <section className="hoja">
          <div className="fila"><h3>Maples en stock</h3><Link to="/palets" className="chico">Ver palets</Link></div>
          {maples.filter((m) => m.producido - m.vendido > 0).map((m) => (
            <div className="fila" key={m.id}>
              <span className="con-muestra"><Muestra color={m.colorHex} /> <span className="principal">{m.codigo}</span></span>
              <span><span className="cifra">{(m.producido - m.vendido).toLocaleString('es-AR')}</span> <span className="chico tenue">paq. en planta · {m.enPalets - m.vendido} en palets listos</span></span>
            </div>
          ))}
        </section>
      )}

      <div className="rejilla dos">
        {materias && (
          <section className="hoja">
            <div className="fila" style={{ borderBottom: '1px solid var(--linea)' }}>
              <h3>Stock de materia prima</h3>
              {puede('materias') && <Link to="/materia-prima" className="chico">Ver todo</Link>}
            </div>
            {materias.filter((m) => m.activo).map((m) => {
              const bajo = m.stockMinimo > 0 && m.stock < m.stockMinimo;
              const pct = m.stockMinimo > 0 ? Math.min(100, (m.stock / (m.stockMinimo * 2)) * 100) : m.stock > 0 ? 100 : 0;
              return (
                <div className="fila" key={m.id}>
                  <span className="principal">{m.nombre}</span>
                  <span className="cifra" style={{ color: bajo ? 'var(--peligro)' : undefined }}>{formatCantidad(m.stock, m.unidad)}</span>
                  <div className={`nivel${bajo ? ' bajo' : ''}`} aria-hidden><i style={{ width: `${pct}%` }} /></div>
                  {bajo && <span className="marca-texto alerta" style={{ gridColumn: '1 / -1', justifySelf: 'start' }}>Por debajo del mínimo ({formatCantidad(m.stockMinimo, m.unidad)})</span>}
                </div>
              );
            })}
            {materias.length === 0 && <div className="vacio"><Package aria-hidden /><p>No hay materia prima cargada.</p></div>}
          </section>
        )}
        {puede('compras') && (
          <section className="hoja">
            <div className="fila"><h3>Hoy</h3><span className="cifra">{formatPesos(validas.reduce((a, c) => a + c.total, 0))}</span></div>
            {validas.length === 0 ? <p className="tenue" style={{ padding: '0 18px 18px' }}>Todavía no se cargó nada hoy.</p> : validas.map((c) => (
              <Link to={`/compras/${c.id}`} className="fila" key={c.id}>
                <div><div className="principal">{c.proveedor}</div><div className="chico tenue">{c.resumen}</div></div>
                <span className="cifra">{formatPesos(c.total)}</span>
              </Link>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
