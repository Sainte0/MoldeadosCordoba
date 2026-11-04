import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Trash2 } from 'lucide-react';
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

/** Agenda: lo atrasado primero, después día por día (próximos 30 días, o desde la fecha que venga en la dirección). */
export function Agenda() {
  const { puede } = useSesion();
  const ir = useNavigate();
  const [f, setF] = useFiltros({ ver: 'mios', fecha: '' });
  const h = hoy();
  const desde = f.fecha && f.fecha > h ? f.fecha : h;
  const todos = f.ver === 'todos' && puede('usuarios', 3);
  const { data, isLoading } = useAgenda(desde, masDias(desde, DIAS), todos);

  const items = data?.items ?? [];
  const atrasados = items.filter((x) => x.atrasado);
  const porDia = new Map<string, ItemAgenda[]>();
  for (const x of items.filter((y) => !y.atrasado)) porDia.set(x.fecha, [...(porDia.get(x.fecha) ?? []), x]);

  return (
    <div className="ancho columna" style={{ display: 'grid', gap: 24 }}>
      <Cabecera titulo="Agenda" bajada="Recordatorios para vos o para el equipo. Les llega un aviso a la hora; lo marca hecho uno y queda hecho para todos.">
        <button className="boton primario" onClick={() => ir('/agenda/nuevo')}><CalendarPlus size={18} aria-hidden /> Nuevo recordatorio</button>
      </Cabecera>
      {puede('usuarios', 3) && (
        <div className="pestanas" role="group" aria-label="Qué ver">
          <button aria-pressed={!todos} onClick={() => setF({ ver: 'mios' })}>Los míos</button>
          <button aria-pressed={todos} onClick={() => setF({ ver: 'todos' })}>De todo el equipo</button>
        </div>
      )}
      {f.fecha && f.fecha > h && <p className="tenue">Desde el {verFecha(f.fecha)} · <button className="enlace" onClick={() => setF({ fecha: '' })}>Ver desde hoy</button></p>}
      {isLoading ? <Cargando /> : !items.length ? (
        <div className="hoja relleno vacio">
          <p>No hay nada agendado para los próximos {DIAS} días.</p>
          <button className="boton secundario" onClick={() => ir('/agenda/nuevo')}><CalendarPlus size={18} aria-hidden /> Agendar algo</button>
        </div>
      ) : (
        <>
          {atrasados.length > 0 && (
            <section className="hoja">
              <div className="fila"><h3>Atrasados</h3><Estado nivel="critico">{atrasados.length === 1 ? '1 sin hacer' : `${atrasados.length} sin hacer`}</Estado></div>
              {atrasados.map((x) => <RenglonAgenda key={x.id + x.fecha} x={x} />)}
            </section>
          )}
          {[...porDia].map(([dia, lista]) => (
            <section className="hoja" key={dia}>
              <div className="fila"><h3>{nombreDia(dia, h)}</h3>{dia === h && <span className="chico tenue">{((n) => (n ? `${n} sin hacer` : 'Todo hecho'))(lista.filter((x) => !x.hecho).length)}</span>}</div>
              {lista.map((x) => <RenglonAgenda key={x.id + x.fecha} x={x} />)}
            </section>
          ))}
        </>
      )}
    </div>
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
  const [fecha, setFecha] = useState(hoy());
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
      ir(`/agenda${fecha > hoy() ? `?fecha=${fecha}` : ''}`, { replace: true });
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
