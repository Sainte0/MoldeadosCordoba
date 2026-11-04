import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { LABEL_REPETIR, REPETICIONES, type Repeticion } from '@moldeados/shared/base';
import { api, hoy, useSesion, verFecha } from '../api';
import { useFiltros } from '../filtros';
import { Asistente, Aviso, Cabecera, Campo, Cargando, Dialogo, Entrada, Opciones, type Paso } from '../ui';
import { Estado } from '../Estado';
import { RenglonAgenda, useAgenda, type ItemAgenda } from './AgendaHoy';

const DIAS = 30;
const masDias = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const fmtDia = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const nombreDia = (iso: string, h: string) => (iso === h ? 'Hoy' : iso === masDias(h, 1) ? 'Mañana' : fmtDia.format(new Date(`${iso}T12:00:00Z`)).replace(/^./, (c) => c.toUpperCase()));

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const ultimoDia = (mes: string) => { const [a, m] = mes.split('-').map(Number); return `${mes}-${String(new Date(Date.UTC(a!, m!, 0)).getUTCDate()).padStart(2, '0')}`; };
const mover = (mes: string, n: number) => { const [a, m] = mes.split('-').map(Number); const d = new Date(Date.UTC(a!, m! - 1 + n, 1)); return d.toISOString().slice(0, 7); };
const nombreMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;

/**
 * Agenda: en lista (lo atrasado primero, después día por día) o en mes (calendario; se toca un día para ver lo
 * suyo). Se puede ir mes por mes. Quien maneja el equipo elige de quién ver la agenda: suya, de una o varias
 * personas, o de todo el equipo. Todo queda en la dirección.
 */
export function Agenda() {
  const { puede, sesion } = useSesion();
  const ir = useNavigate();
  const jefe = puede('usuarios', 3);
  const [f, setF] = useFiltros({ vista: 'lista', mes: '', dia: '', quien: '', fecha: '' });
  const h = hoy();
  const esteMes = h.slice(0, 7);
  const mes = /^\d{4}-\d{2}$/.test(f.mes) ? f.mes : f.fecha ? f.fecha.slice(0, 7) : esteMes;
  const porMes = f.vista === 'mes' || !!f.mes || !!f.fecha;
  // Lista sin mes elegido: los próximos 30 días desde hoy. Con mes (o vista mes): ese mes entero.
  const desde = porMes ? `${mes}-01` : h;
  const hasta = porMes ? ultimoDia(mes) : masDias(h, DIAS);
  const quien = jefe ? f.quien : '';
  const { data, isLoading } = useAgenda(desde, hasta, quien);
  const { data: personas } = useQuery({ queryKey: ['agenda', 'personas'], queryFn: () => api<Persona[]>('/agenda/personas'), enabled: jefe });

  const items = data?.items ?? [];
  const atrasados = items.filter((x) => x.atrasado && x.fecha < desde);
  const delRango = items.filter((x) => !(x.atrasado && x.fecha < desde));
  const porDia = new Map<string, ItemAgenda[]>();
  for (const x of delRango) porDia.set(x.fecha, [...(porDia.get(x.fecha) ?? []), x]);

  const elegidos = quien && quien !== 'todos' ? quien.split(',') : [];
  const alternar = (id: string) => {
    const n = elegidos.includes(id) ? elegidos.filter((x) => x !== id) : [...elegidos, id];
    setF({ quien: n.join(',') });
  };
  const deQuien = quien === 'todos' ? 'de todo el equipo' : elegidos.length ? `de ${(personas ?? []).filter((p) => elegidos.includes(p.id)).map((p) => p.nombre.split(' ')[0]).join(', ')}` : 'tuya';

  return (
    <div className="ancho" style={{ display: 'grid', gap: 20 }}>
      <Cabecera titulo="Agenda" bajada="Recordatorios para vos o para el equipo. Les llega un aviso a la hora; lo marca hecho uno y queda hecho para todos.">
        <button className="boton primario" onClick={() => ir(`/agenda/nuevo${f.dia ? `?fecha=${f.dia}` : ''}`)}><CalendarPlus size={18} aria-hidden /> Nuevo recordatorio</button>
      </Cabecera>

      {jefe && (
        <div className="hoja relleno" style={{ display: 'grid', gap: 10 }}>
          <span className="chico tenue">Ver la agenda de</span>
          <div className="chips" role="group" aria-label="De quién">
            <button aria-pressed={!quien} onClick={() => setF({ quien: '' })}>Mía</button>
            <button aria-pressed={quien === 'todos'} onClick={() => setF({ quien: 'todos' })}>Todo el equipo</button>
            {(personas ?? []).filter((p) => p.id !== sesion?.usuario.id).map((p) => <button key={p.id} aria-pressed={elegidos.includes(p.id)} onClick={() => alternar(p.id)}>{p.nombre}</button>)}
          </div>
        </div>
      )}

      <div className="barra-agenda">
        <div className="pestanas" role="group" aria-label="Vista">
          <button aria-pressed={!porMes} onClick={() => setF({ vista: 'lista', mes: '', dia: '', fecha: '' })}>Próximos días</button>
          <button aria-pressed={porMes} onClick={() => setF({ vista: 'mes', fecha: '' })}>Mes</button>
        </div>
        {porMes && (
          <div className="navegar-mes">
            <button className="boton icono" aria-label="Mes anterior" onClick={() => setF({ mes: mover(mes, -1), dia: '', fecha: '' })}><ChevronLeft size={22} /></button>
            <b>{nombreMes(mes)}</b>
            <button className="boton icono" aria-label="Mes siguiente" onClick={() => setF({ mes: mover(mes, 1), dia: '', fecha: '' })}><ChevronRight size={22} /></button>
            {mes !== esteMes && <button className="boton fantasma" onClick={() => setF({ mes: '', dia: '', fecha: '' })}>Este mes</button>}
          </div>
        )}
      </div>

      {isLoading ? <Cargando /> : (
        <>
          {atrasados.length > 0 && (
            <section className="hoja">
              <div className="fila"><h3>Atrasados</h3><Estado nivel="critico">{atrasados.length === 1 ? '1 sin hacer' : `${atrasados.length} sin hacer`}</Estado></div>
              {atrasados.map((x) => <RenglonAgenda key={x.id + x.fecha} x={x} />)}
            </section>
          )}
          {porMes
            ? <VistaMes mes={mes} hoy={h} porDia={porDia} dia={f.dia} onDia={(d) => setF({ dia: d })} deQuien={deQuien} onNuevo={(d) => ir(`/agenda/nuevo?fecha=${d}`)} />
            : !delRango.length ? (
              <div className="hoja relleno vacio">
                <p>No hay nada agendado {quien ? deQuien : ''} para los próximos {DIAS} días.</p>
                <button className="boton secundario" onClick={() => ir('/agenda/nuevo')}><CalendarPlus size={18} aria-hidden /> Agendar algo</button>
              </div>
            ) : [...porDia].map(([d, lista]) => (
              <section className="hoja" key={d}>
                <div className="fila"><h3>{nombreDia(d, h)}</h3>{d === h && <span className="chico tenue">{((n) => (n ? `${n} sin hacer` : 'Todo hecho'))(lista.filter((x) => !x.hecho).length)}</span>}</div>
                {lista.map((x) => <RenglonAgenda key={x.id + x.fecha} x={x} />)}
              </section>
            ))}
        </>
      )}
    </div>
  );
}

/** Calendario del mes: cada día con sus recordatorios (en el teléfono, puntitos); tocando un día se ve el detalle. */
function VistaMes({ mes, hoy: h, porDia, dia, onDia, deQuien, onNuevo }: { mes: string; hoy: string; porDia: Map<string, ItemAgenda[]>; dia: string; onDia: (d: string) => void; deQuien: string; onNuevo: (d: string) => void }) {
  const primero = new Date(`${mes}-01T12:00:00Z`);
  const corrimiento = (primero.getUTCDay() + 6) % 7; // lunes = 0
  const ultimo = Number(ultimoDia(mes).slice(8));
  const celdas: (string | null)[] = [...Array(corrimiento).fill(null), ...Array.from({ length: ultimo }, (_, i) => `${mes}-${String(i + 1).padStart(2, '0')}`)];
  while (celdas.length % 7) celdas.push(null);
  const elegido = dia && dia.startsWith(mes) ? dia : h.startsWith(mes) ? h : `${mes}-01`;
  const delDia = porDia.get(elegido) ?? [];
  const estado = (x: ItemAgenda) => (x.hecho ? 'hecho' : x.atrasado ? 'atrasado' : 'pendiente');

  return (
    <>
      <section className="hoja calendario" aria-label={`Agenda ${deQuien} de ${nombreMes(mes)}`}>
        {DIAS_SEMANA.map((d) => <div key={d} className="dia-semana">{d}</div>)}
        {celdas.map((c, i) => {
          if (!c) return <div key={i} className="celda vacia" />;
          const lista = porDia.get(c) ?? [];
          return (
            <button key={c} className={`celda${c === h ? ' hoy' : ''}${c === elegido ? ' elegida' : ''}`} onClick={() => onDia(c)} aria-label={`${nombreDia(c, h)}: ${lista.length ? `${lista.length} recordatorios` : 'nada agendado'}`}>
              <span className="numero">{Number(c.slice(8))}</span>
              <span className="items">
                {lista.slice(0, 3).map((x) => <span key={x.id} className={`item ${estado(x)}`}>{x.hora && <b>{x.hora} </b>}{x.titulo}</span>)}
                {lista.length > 3 && <span className="mas">+{lista.length - 3}</span>}
              </span>
              <span className="puntos" aria-hidden>{lista.slice(0, 4).map((x) => <i key={x.id} className={estado(x)} />)}</span>
            </button>
          );
        })}
      </section>
      <section className="hoja">
        <div className="fila">
          <h3>{nombreDia(elegido, h)}</h3>
          <button className="boton fantasma" onClick={() => onNuevo(elegido)}><CalendarPlus size={18} aria-hidden /> Agendar este día</button>
        </div>
        {delDia.length ? delDia.map((x) => <RenglonAgenda key={x.id + x.fecha} x={x} />) : <p className="tenue" style={{ padding: '0 18px 18px' }}>Nada agendado {deQuien === 'tuya' ? '' : deQuien} este día.</p>}
      </section>
    </>
  );
}

interface Persona { id: string; nombre: string }
type ParaQuien = 'yo' | 'todos' | 'elegir';

/** Asistente para crear o editar un recordatorio: qué, cuándo, para quién. */
export function NuevoRecordatorio() {
  const { id } = useParams();
  const { sesion } = useSesion();
  const ir = useNavigate();
  const qc = useQueryClient();
  const yo = sesion!.usuario.id;
  const { data: personas } = useQuery({ queryKey: ['agenda', 'personas'], queryFn: () => api<Persona[]>('/agenda/personas') });
  const { data: previo, isLoading } = useQuery({
    queryKey: ['agenda', 'uno', id],
    queryFn: () => api<{ titulo: string; detalle: string | null; fecha: string; hora: string | null; repetir: Repeticion; paraTodos: boolean; usuarios: string[] }>(`/agenda/${id}`),
    enabled: !!id,
  });

  const [titulo, setTitulo] = useState('');
  const [detalle, setDetalle] = useState('');
  const [params] = useSearchParams();
  const [fecha, setFecha] = useState(() => (/^\d{4}-\d{2}-\d{2}$/.test(params.get('fecha') ?? '') ? params.get('fecha')! : hoy()));
  const [hora, setHora] = useState('');
  const [repetir, setRepetir] = useState<Repeticion>('no');
  const [para, setPara] = useState<ParaQuien>('yo');
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [borrar, setBorrar] = useState(false);

  useEffect(() => {
    if (!previo) return;
    setTitulo(previo.titulo); setDetalle(previo.detalle ?? ''); setFecha(previo.fecha); setHora(previo.hora ?? ''); setRepetir(previo.repetir);
    setPara(previo.paraTodos ? 'todos' : previo.usuarios.length === 1 && previo.usuarios[0] === yo ? 'yo' : 'elegir');
    setElegidos(previo.usuarios);
  }, [previo, yo]);

  if (id && isLoading) return <Cargando />;
  const usuarios = para === 'yo' ? [yo] : para === 'todos' ? [] : elegidos;
  const nombres = (personas ?? []).filter((p) => usuarios.includes(p.id)).map((p) => p.nombre);

  const guardar = async () => {
    setGuardando(true); setError(null);
    try {
      const body = { titulo, detalle: detalle || undefined, fecha, hora: hora || null, repetir, paraTodos: para === 'todos', usuarios };
      await api(id ? `/agenda/${id}` : '/agenda', { method: id ? 'PUT' : 'POST', body });
      await qc.invalidateQueries({ queryKey: ['agenda'] });
      ir(`/agenda${fecha.slice(0, 7) !== hoy().slice(0, 7) ? `?vista=mes&mes=${fecha.slice(0, 7)}&dia=${fecha}` : fecha > hoy() ? `?vista=mes&dia=${fecha}` : ''}`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
      setGuardando(false);
    }
  };

  const pasos: Paso[] = [
    {
      titulo: '¿Qué hay que recordar?',
      ayuda: 'En pocas palabras, como una tarea: "Limpiar moldes de MP-2", "Llamar a Avícola Sur", "Pagar luz".',
      contenido: (
        <>
          <Campo etiqueta="Qué"><Entrada value={titulo} onChange={(e) => setTitulo(e.target.value)} autoFocus maxLength={140} placeholder="Ej.: limpiar moldes de MP-2" /></Campo>
          <Campo etiqueta="Detalle" ayuda="Opcional"><textarea className="entrada" value={detalle} onChange={(e) => setDetalle(e.target.value)} maxLength={1000} /></Campo>
        </>
      ),
      listo: titulo.trim().length >= 2 ? true : 'Escribí qué hay que recordar',
    },
    {
      titulo: '¿Cuándo?',
      ayuda: 'El día y, si importa, la hora: a esa hora les llega el aviso. Sin hora, el aviso sale a las 8 de la mañana.',
      contenido: (
        <>
          <Campo etiqueta="Día" ayuda={fecha === hoy() ? 'Hoy' : verFecha(fecha)}><Entrada type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></Campo>
          <Campo etiqueta="Hora" ayuda="Opcional"><Entrada type="time" value={hora} onChange={(e) => setHora(e.target.value)} /></Campo>
          <Campo etiqueta="Se repite"><Opciones columnas valor={repetir} onChange={setRepetir} opciones={REPETICIONES.map((r) => ({ valor: r, titulo: LABEL_REPETIR[r] }))} /></Campo>
        </>
      ),
      listo: /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? true : 'Elegí el día',
    },
    {
      titulo: '¿Para quién?',
      ayuda: 'A cada persona le aparece en su agenda y le llega el aviso. Cuando uno lo marca hecho, queda hecho para todos.',
      contenido: (
        <>
          <Opciones<ParaQuien> valor={para} onChange={setPara} opciones={[
            { valor: 'yo', titulo: 'Solo para mí' },
            { valor: 'elegir', titulo: 'Para algunas personas', detalle: 'Elegís a quiénes' },
            { valor: 'todos', titulo: 'Para todo el equipo', detalle: 'Todos los que tienen usuario' },
          ]} />
          {para === 'elegir' && (
            <div className="opciones dos">
              {(personas ?? []).map((p) => (
                <button type="button" key={p.id} className="opcion" aria-pressed={elegidos.includes(p.id)} onClick={() => setElegidos(elegidos.includes(p.id) ? elegidos.filter((x) => x !== p.id) : [...elegidos, p.id])}>
                  <span className="marca-op" aria-hidden /><span><b>{p.nombre}</b>{p.id === yo && <small>Vos</small>}</span>
                </button>
              ))}
            </div>
          )}
        </>
      ),
      listo: para !== 'elegir' || elegidos.length ? true : 'Elegí al menos una persona',
    },
    {
      titulo: 'Revisá y guardá',
      ayuda: id ? 'Si cambiaste el día o la hora, el aviso sale de nuevo en la fecha nueva.' : 'Al guardar, a cada persona le llega un aviso de que se lo agendaste.',
      contenido: (
        <>
          <dl className="resumen hoja relleno">
            <dt>Qué</dt><dd>{titulo}</dd>
            {detalle && <><dt>Detalle</dt><dd>{detalle}</dd></>}
            <dt>Cuándo</dt><dd>{verFecha(fecha)}{hora ? `, ${hora}` : ''}{repetir !== 'no' ? ` · ${LABEL_REPETIR[repetir].toLowerCase()}` : ''}</dd>
            <dt>Para</dt><dd>{para === 'todos' ? 'Todo el equipo' : nombres.join(', ')}</dd>
          </dl>
          {id && <button type="button" className="boton fantasma peligro" style={{ justifySelf: 'start' }} onClick={() => setBorrar(true)}><Trash2 size={18} aria-hidden /> Borrar recordatorio</button>}
        </>
      ),
      listo: true,
    },
  ];

  return (
    <>
      <Asistente proceso="agenda" pasos={pasos} onTerminar={guardar} textoTerminar={id ? 'Guardar cambios' : 'Agendar'} guardando={guardando} error={error} onCancelar={() => ir(-1)} />
      {borrar && id && (
        <Dialogo titulo="¿Borrar este recordatorio?" onCerrar={() => setBorrar(false)}>
          <p>Deja de aparecer en la agenda de todos{repetir !== 'no' ? ', también las próximas veces' : ''}. Queda registrado quién lo borró.</p>
          <Aviso>{error}</Aviso>
          <div className="acciones">
            <button className="boton secundario" onClick={() => setBorrar(false)}>No, dejarlo</button>
            <button className="boton primario peligro" onClick={async () => {
              try { await api(`/agenda/${id}`, { method: 'DELETE' }); await qc.invalidateQueries({ queryKey: ['agenda'] }); ir('/agenda', { replace: true }); }
              catch (e) { setError(e instanceof Error ? e.message : 'No se pudo borrar'); }
            }}>Borrar</button>
          </div>
        </Dialogo>
      )}
    </>
  );
}
