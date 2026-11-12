import { Link, useLocation } from 'react-router-dom';
import { useFiltros } from '../filtros';
import { PlanillaDia } from './Planilla';
import { CalendarClock, ChartColumn, ChevronRight, Package, QrCode } from 'lucide-react';
import { estadoStock, formatCantidad, ORDEN_NIVEL } from '@moldeados/shared/base';
import { hoy, useSesion, verFecha } from '../api';
import { useMaterias, type MateriaPrima } from '../datos';
import { MateriaRapida } from './MateriaRapida';
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
  const hoyStr = hoy();

  const aviso = (useLocation().state as { aviso?: string } | null)?.aviso;
  // El inicio es "Hoy": la planilla del día. Se puede mirar o completar otro día (queda en la dirección).
  const [f, setF] = useFiltros({ fecha: hoyStr });
  const conPlanilla = puede('produccion') || puede('ventas') || puede('compras');
  const otras = TAREAS.filter((t) => puede(t.modulo, 2));
  const [materia, setMateria] = useState<MateriaPrima | null>(null);
  return (
    <div className="ancho" style={{ display: 'grid', gap: 20 }}>
      {aviso && <div className="aviso ok" role="status">{aviso}</div>}
      {/* Franja de marca: el saludo, el día y el turno sobre la grilla de alvéolos de un maple. */}
      <header className="inicio-cabeza">
        <p className="inicio-dia">{diaYTurno()}</p>
        <h1>{saludo()}, {sesion?.usuario.nombre.split(' ')[0]}</h1>
        <nav className="inicio-links" aria-label="Accesos">
          <Link to="/agenda"><CalendarClock size={16} aria-hidden /> Agenda</Link>
          {puede('tablero') && <Link to="/tablero"><ChartColumn size={16} aria-hidden /> Tablero</Link>}
          {conPlanilla && (
            <label className="inicio-otro-dia">
              <span>{f.fecha === hoyStr ? 'Otro día' : verFecha(f.fecha)}</span>
              <input type="date" value={f.fecha} max={hoyStr} onChange={(e) => setF({ fecha: e.target.value || hoyStr })} aria-label="Ver o completar otro día" />
            </label>
          )}
          {f.fecha !== hoyStr && <button type="button" onClick={() => setF({ fecha: hoyStr })}>Volver a hoy</button>}
        </nav>
      </header>

      <Bienvenida />
      {/* Orden: lo que hay que cargar primero (lo urgente está en el ícono de Atención, arriba a la derecha), lo que viene
          y después cómo estamos. */}
      <AgendaHoy />

      {conPlanilla ? <PlanillaDia fecha={f.fecha} /> : (
        <div className="tareas">
          {otras.slice(0, 4).map((t) => (
            <Link key={t.a} to={t.a} className="tarea" data-tarea={t.corto}>
              <span className="ico"><t.icono size={24} aria-hidden /></span>
              <span><b>{t.titulo}</b><small>{t.detalle}</small></span>
              <ChevronRight aria-hidden />
            </Link>
          ))}
        </div>
      )}

      {/* Lo que viene: pedidos de la semana. ("Para vender" llega como notificación.) */}
      <PedidosProximos />

      <div className="rejilla dos">
        {materias && (
          <section className="hoja">
            <div className="fila">
              <div><h3>Materia prima</h3><span className="chico tenue">Tocá una para anotar que entró o corregir</span></div>
              {puede('materias') && <Link to="/materia-prima" className="chico">Ver todo</Link>}
            </div>
            {materias.filter((m) => m.activo)
              .map((m) => ({ m, e: estadoStock(m), sinCargar: m.stock === 0 && m.dias === null }))
              .sort((x, y) => Number(x.sinCargar) - Number(y.sinCargar) || ORDEN_NIVEL[x.e.nivel] - ORDEN_NIVEL[y.e.nivel])
              .map(({ m, e, sinCargar }) => (
                <button type="button" className="fila" key={m.id} onClick={() => setMateria(m)} disabled={!puede('compras', 2) && !puede('materias', 3)}>
                  <span className="principal">{m.nombre}</span>
                  <span className="derecha materia-dato">
                    <span className="cifra">{formatCantidad(e.stockVisible, m.unidad)}</span>
                    {sinCargar ? <span className="marca-texto">Sin cargar</span> : <Estado nivel={e.nivel}>{e.titulo}</Estado>}
                    <ChevronRight size={18} aria-hidden className="tenue" />
                  </span>
                </button>
              ))}
            {materias.length === 0 && <div className="vacio"><Package aria-hidden /><p>No hay materia prima cargada.</p></div>}
          </section>
        )}
        {materia && <MateriaRapida m={materia} onCerrar={() => setMateria(null)} />}
      </div>

      {/* Los asistentes paso a paso y el escáner: para quien prefiere cargar de a una cosa o con el QR. */}
      {conPlanilla && otras.length > 0 && (
        <section className="otras-cargas">
          <h3>Otras formas de cargar</h3>
          <div>
            <Link to="/escanear" className="chip-carga"><QrCode size={18} aria-hidden /> Escanear un palet</Link>
            {otras.filter((t) => t.a !== '/planilla').map((t) => <Link key={t.a} to={t.a} className="chip-carga"><t.icono size={18} aria-hidden /> {t.titulo}</Link>)}
          </div>
        </section>
      )}
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

/** "Miércoles 11 de noviembre · turno mañana" (hora argentina; la planta trabaja en dos turnos). */
function diaYTurno(): string {
  const z = { timeZone: 'America/Argentina/Buenos_Aires' } as const;
  const ahora = new Date();
  const dia = new Intl.DateTimeFormat('es-AR', { ...z, weekday: 'long', day: 'numeric', month: 'long' }).format(ahora).replace(',', '');
  const h = Number(new Intl.DateTimeFormat('es-AR', { ...z, hour: 'numeric', hour12: false }).format(ahora));
  // El turno solo en horario de planta (mañana 6 a 14, tarde 14 a 22); de noche, solo el día.
  const turno = h >= 6 && h < 14 ? ' · turno mañana' : h >= 14 && h < 22 ? ' · turno tarde' : '';
  return `${dia.charAt(0).toUpperCase()}${dia.slice(1)}${turno}`;
}
