import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, ChartColumn, ChevronRight, Coins, Factory, Layers, Package, Scale, ScanLine, ShoppingCart, Wallet } from 'lucide-react';
import { estadoStock, formatCantidad, formatPesos, ORDEN_NIVEL, type Modulo, plural } from '@moldeados/shared/base';
import { api, hoy, useSesion } from '../api';
import { useMaterias, useStockMaples, type CompraFila } from '../datos';
import { Muestra } from '../MapleVista';
import { TAREAS } from '../navegacion';
import { PedidosProximos } from './Avisos';
import { Dialogo } from '../ui';
import { Estado } from '../Estado';
import { AgendaHoy } from './AgendaHoy';
import { iniciarRecorrido } from '../Recorrido';
import { useState } from 'react';

function saludo(): string {
  const h = Number(new Intl.DateTimeFormat('es-AR', { hour: 'numeric', hour12: false, timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date()));
  // De madrugada (antes de las 6) también es de noche: "Buen día" a las 00:19 no corresponde.
  return h < 6 ? 'Buenas noches' : h < 13 ? 'Buen día' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
}

export function Inicio() {
  const { sesion, puede } = useSesion();
  const { data: materias } = useMaterias();
  const { data: maples } = useStockMaples(puede('produccion'));
  const hoyStr = hoy();
  const { data: deHoy } = useQuery({ queryKey: ['compras', 'hoy', hoyStr], queryFn: () => api<CompraFila[]>(`/compras?desde=${hoyStr}&hasta=${hoyStr}`), enabled: puede('compras') });
  const validas = (deHoy ?? []).filter((c) => !c.anuladaAt);

  const aviso = (useLocation().state as { aviso?: string } | null)?.aviso;
  return (
    <div className="ancho" style={{ display: 'grid', gap: 32 }}>
      {aviso && <div className="aviso ok" role="status">{aviso}</div>}
      <header>
        <h1>{saludo()}, {sesion?.usuario.nombre.split(' ')[0]}</h1>
        <p className="tenue" style={{ marginTop: 6 }}>¿Qué vas a cargar? · <Link to="/agenda" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><CalendarClock size={16} aria-hidden /> Agenda</Link>{puede('tablero') && <> · <Link to="/tablero" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><ChartColumn size={16} aria-hidden /> Tablero</Link></>}</p>
      </header>

      <Bienvenida />
      {/* Orden: lo que hay que cargar primero (lo urgente está en el ícono de Atención, arriba a la derecha), lo que viene
          y después cómo estamos. */}
      <AgendaHoy />

      <div className="tareas">
        {TAREAS.filter((t) => puede(t.modulo, 2)).slice(0, 4).map((t, i) => (
          <Link key={t.a} to={t.a} className={`tarea${i < 2 ? '' : ' clara'}`}>
            <span className="ico"><t.icono size={24} aria-hidden /></span>
            <span><b>{t.titulo}</b><small>{t.detalle}</small></span>
            <ChevronRight aria-hidden />
          </Link>
        ))}
      </div>

      {/* "Para vender" llega como notificación (campana) y la lista completa está en Ventas › Clientes. */}
      <PedidosProximos />

      {maples && maples.some((m) => m.producido - m.vendido > 0) && (
        <section className="hoja">
          <div className="fila"><h3>Maples en stock</h3><Link to="/palets" className="chico">Ver palets</Link></div>
          {maples.filter((m) => m.producido - m.vendido > 0).map((m) => (
            <div className="fila" key={m.id}>
              <span className="con-muestra"><Muestra color={m.colorHex} /> <span><span className="principal">{m.codigo}</span><br /><span className="chico tenue">{m.enPalets - m.vendido > 0 ? `${plural(m.enPalets - m.vendido, 'paquete', 'paquetes')} en palets listos` : 'Todavía sin paletizar'}</span></span></span>
              <span className="derecha"><span className="cifra">{(m.producido - m.vendido).toLocaleString('es-AR')}</span><br /><span className="chico tenue">paquetes</span></span>
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
            {materias.filter((m) => m.activo)
              .map((m) => ({ m, e: estadoStock(m) }))
              .sort((x, y) => ORDEN_NIVEL[x.e.nivel] - ORDEN_NIVEL[y.e.nivel])
              .map(({ m, e }) => (
                <div className="fila" key={m.id}>
                  <div><div className="principal">{m.nombre}</div><div className="chico tenue">{m.stock < 0 ? 'Falta cargar una compra o corregir el stock.' : e.detalle}</div></div>
                  <div className="derecha"><div className="cifra">{formatCantidad(e.stockVisible, m.unidad)}</div><Estado nivel={e.nivel}>{e.titulo}</Estado></div>
                  <div className={`nivel ${e.nivel}`} aria-hidden><i style={{ width: `${m.dias === null ? (e.stockVisible > 0 ? 100 : 0) : Math.min(100, (m.dias / 30) * 100)}%` }} /></div>
                </div>
              ))}
            {materias.length === 0 && <div className="vacio"><Package aria-hidden /><p>No hay materia prima cargada.</p></div>}
          </section>
        )}
        {puede('compras') && (
          <section className="hoja">
            <div className="fila"><div><h3>Compras y pesajes de hoy</h3>{validas.length > 0 && <p className="chico tenue">{plural(validas.length, 'carga', 'cargas')}</p>}</div>{validas.length > 0 && <span className="cifra">{formatPesos(validas.reduce((a, c) => a + c.total, 0))}</span>}</div>
            {validas.length === 0 ? <p className="tenue" style={{ padding: '0 18px 18px' }}>Todavía no se cargó nada hoy.</p> : validas.map((c) => (
              <Link to={`/compras/${c.numero}`} className="fila" key={c.id}>
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

/** La primera vez que alguien entra (en este teléfono): un modal que ofrece el recorrido por el sistema. */
function Bienvenida() {
  const clave = 'moldeados:recorrido-visto';
  const [visto, setVisto] = useState(() => { try { return localStorage.getItem(clave) === '1'; } catch { return true; } });
  if (visto) return null;
  const cerrar = () => { try { localStorage.setItem(clave, '1'); } catch { /* sin almacenamiento: se vuelve a ofrecer */ } setVisto(true); };
  return (
    <Dialogo titulo="¿Primera vez en el sistema?" onCerrar={cerrar}>
      <p>Te mostramos lo principal en un minuto: dónde están las tareas, los avisos, el buscador y la ayuda. Podés tocar las cosas mientras tanto.</p>
      <p className="chico tenue">Cada guía de Ayuda también tiene su "Mostrame cómo".</p>
      <div className="acciones">
        <button className="boton secundario" onClick={cerrar}>Ahora no</button>
        <button className="boton primario" onClick={() => { cerrar(); iniciarRecorrido('inicio', 'Conocé el sistema'); }}>Mostrame</button>
      </div>
    </Dialogo>
  );
}
