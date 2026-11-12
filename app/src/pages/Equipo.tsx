import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { aCentavos, LABEL_ROL, LABEL_TURNO, MODULOS, NIVELES, ROLES, TURNOS, type MatrizPermisos, type Rol, type Turno } from '@moldeados/shared/base';
import { useEmpleados, useEmpresa, type Empleado } from '../datos';
import { api, useSesion, type Usuario } from '../api';
import { useFiltros } from '../filtros';
import { Aviso, Cabecera, Campo, Cargando, Dialogo, Entrada, EntradaNumero, Opciones } from '../ui';

export function Equipo() {
  const { puede, sesion } = useSesion();
  const qc = useQueryClient();
  const { data: usuarios, isLoading } = useQuery({ queryKey: ['usuarios'], queryFn: () => api<Usuario[]>('/usuarios') });
  const { data: matriz } = useQuery({ queryKey: ['permisos'], queryFn: () => api<MatrizPermisos>('/permisos') });
  const [editando, setEditando] = useState<Partial<Usuario> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const edita = puede('usuarios', 3);
  // Una sección por vez (antes era todo seguido y se scrolleaba mucho); la pestaña queda en la dirección.
  const [f, setF] = useFiltros({ ver: 'personas', rol: 'administracion' });
  const secciones = ([['personas', 'Personas'], ['permisos', 'Permisos'], ['planta', 'Planta'], ['empresa', 'Empresa']] as const)
    .filter(([k]) => k !== 'planta' || puede('produccion', 1) || edita);
  const ver = secciones.some(([k]) => k === f.ver) ? f.ver : 'personas';
  const rolPermisos = (ROLES as readonly string[]).includes(f.rol) && f.rol !== 'dueno' ? (f.rol as Rol) : 'administracion';

  const cambiarNivel = async (rol: Rol, modulo: string, nivel: number) => {
    setError(null);
    try {
      qc.setQueryData(['permisos'], await api<MatrizPermisos>('/permisos', { method: 'PUT', body: { rol, modulo, nivel } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar');
    }
  };

  return (
    <div className="ancho" style={{ display: 'grid', gap: 20 }}>
      <div className="pestanas" role="group" aria-label="Sección">
        {secciones.map(([k, l]) => <button key={k} type="button" aria-pressed={ver === k} onClick={() => setF({ ver: k })}>{l}</button>)}
      </div>
      {ver === 'personas' && <section>
        <Cabecera titulo="Equipo" bajada="Cada persona entra con su usuario. Todo lo que carga queda a su nombre.">
          {edita && <button className="boton primario" onClick={() => setEditando({ rol: 'operario', activo: true })}><Plus size={18} aria-hidden /> Agregar persona</button>}
        </Cabecera>
        {isLoading ? <Cargando /> : (
          <div className="hoja filas">
            {usuarios?.map((u) => (
              <button key={u.id} className="fila" onClick={() => edita && setEditando(u)} disabled={!edita} style={{ opacity: u.activo ? 1 : 0.55 }}>
                <div><div className="principal">{u.nombre}{u.id === sesion?.usuario.id ? ' (vos)' : ''}</div><div className="chico tenue">Usuario: {u.usuario}</div></div>
                <span className={`marca-texto ${u.activo ? 'kraft' : ''}`}>{u.activo ? LABEL_ROL[u.rol] : 'Sin acceso'}</span>
              </button>
            ))}
          </div>
        )}
      </section>}

      {ver === 'permisos' && matriz && (
        <section>
          <Cabecera titulo="Qué puede hacer cada rol" bajada="El dueño ve y hace todo, siempre. Los cambios aplican al instante." />
          <Aviso>{error}</Aviso>
          {/* Un rol por vez: con los tres seguidos, el nombre del rol se confundía con el de cada módulo. */}
          <div className="pestanas" role="group" aria-label="Rol" style={{ marginBottom: 12 }}>
            {ROLES.filter((r) => r !== 'dueno').map((r) => <button key={r} type="button" aria-pressed={rolPermisos === r} onClick={() => setF({ rol: r })}>{LABEL_ROL[r].split(' ')[0]}</button>)}
          </div>
          <div className="hoja relleno" style={{ overflowX: 'auto' }}>
            {[rolPermisos].map((rol) => (
              <div key={rol} style={{ marginBottom: 16 }}>
                <table className="permisos">
                  <tbody>
                    {MODULOS.map((m) => (
                      <tr key={m.id}>
                        <td><b>{m.label}</b><div className="chico tenue">{m.detalle}</div></td>
                        <td>
                          <div className="niveles" role="group" aria-label={`${LABEL_ROL[rol]}: ${m.label}`}>
                            {NIVELES.map((n, i) => (
                              <button key={n} type="button" title={n} aria-pressed={matriz[rol][m.id] === i} disabled={!edita} onClick={() => cambiarNivel(rol, m.id, i)}>
                                {['No', 'Ver', 'Cargar', 'Todo'][i]}
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            <p className="chico tenue">Ver: solo mirar. Cargar: además puede registrar cosas nuevas. Todo: además puede editar y anular.</p>
          </div>
        </section>
      )}
      {ver === 'planta' && <PersonalPlanta />}
      {ver === 'empresa' && <DatosEmpresa editable={edita} />}
      {editando && <EditarUsuario inicial={editando} onCerrar={() => setEditando(null)} />}
    </div>
  );
}

function EditarUsuario({ inicial, onCerrar }: { inicial: Partial<Usuario>; onCerrar: () => void }) {
  const { sesion } = useSesion();
  const qc = useQueryClient();
  const [nombre, setNombre] = useState(inicial.nombre ?? '');
  const [usuario, setUsuario] = useState(inicial.usuario ?? '');
  const [rol, setRol] = useState<Rol>(inicial.rol ?? 'operario');
  const [activo, setActivo] = useState(inicial.activo ?? true);
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState(inicial.email ?? '');
  const [error, setError] = useState<string | null>(null);
  const roles = ROLES.filter((r) => r !== 'dueno' || sesion?.usuario.rol === 'dueno');

  const guardar = async () => {
    setError(null);
    try {
      await api(inicial.id ? `/usuarios/${inicial.id}` : '/usuarios', { method: inicial.id ? 'PUT' : 'POST', body: { nombre, usuario, rol, activo, password: password || undefined, email: email.trim() || null } });
      await qc.invalidateQueries({ queryKey: ['usuarios'] });
      onCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    }
  };

  return (
    <Dialogo titulo={inicial.id ? inicial.nombre ?? '' : 'Agregar persona'} onCerrar={onCerrar}>
      <Campo etiqueta="Nombre y apellido"><Entrada value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus /></Campo>
      <Campo etiqueta="Usuario" ayuda="Con esto entra. Sin espacios, ej.: juan.perez"><Entrada value={usuario} onChange={(e) => setUsuario(e.target.value)} autoCapitalize="none" /></Campo>
      <Campo etiqueta="Mail" ayuda="Opcional. Con el mail puede recuperar la contraseña sola, con un código."><Entrada type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoCapitalize="none" autoComplete="off" placeholder="nombre@ejemplo.com" /></Campo>
      <Campo etiqueta={inicial.id ? 'Contraseña nueva' : 'Contraseña'} ayuda={inicial.id ? 'Dejalo vacío para no cambiarla' : 'Al menos 6 caracteres. Pasásela en persona.'}>
        <Entrada type="text" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
      </Campo>
      <Campo etiqueta="Rol"><Opciones columnas valor={rol} onChange={setRol} opciones={roles.map((r) => ({ valor: r, titulo: LABEL_ROL[r] }))} /></Campo>
      {inicial.id && <Opciones columnas valor={activo} onChange={setActivo} opciones={[{ valor: true, titulo: 'Puede entrar' }, { valor: false, titulo: 'Sin acceso', detalle: 'Lo que cargó queda registrado' }]} />}
      <Aviso>{error}</Aviso>
      <div className="acciones">
        <button className="boton secundario" onClick={onCerrar}>Cancelar</button>
        <button className="boton primario" onClick={guardar}>{inicial.id ? 'Guardar cambios' : 'Agregar'}</button>
      </div>
    </Dialogo>
  );
}

function PersonalPlanta() {
  const { puede } = useSesion();
  const { data } = useEmpleados();
  const [editando, setEditando] = useState<Partial<Empleado> | null>(null);
  const edita = puede('produccion', 3) || puede('usuarios', 3);
  return (
    <section>
      <Cabecera titulo="Personal de planta" bajada="Quienes trabajan en las máquinas. Se marcan en cada producción del turno; no necesitan usuario.">
        {edita && <button className="boton secundario" onClick={() => setEditando({ activo: true, turnoHabitual: null })}><Plus size={18} aria-hidden /> Agregar</button>}
      </Cabecera>
      <div className="hoja filas">
        {!data?.length && <p className="tenue" style={{ padding: 16 }}>Todavía no hay personal cargado.</p>}
        {data?.map((e) => (
          <button key={e.id} className="fila" disabled={!edita} onClick={() => setEditando(e)} style={{ opacity: e.activo ? 1 : 0.55 }}>
            <span className="principal">{e.nombre}</span>
            <span className="marca-texto">{!e.activo ? 'Ya no trabaja' : e.turnoHabitual ? `Turno ${LABEL_TURNO[e.turnoHabitual].toLowerCase()}` : 'Rota'}</span>
          </button>
        ))}
      </div>
      {editando && <EditarEmpleado inicial={editando} onCerrar={() => setEditando(null)} />}
    </section>
  );
}

function EditarEmpleado({ inicial, onCerrar }: { inicial: Partial<Empleado>; onCerrar: () => void }) {
  const qc = useQueryClient();
  const [nombre, setNombre] = useState(inicial.nombre ?? '');
  const [turno, setTurno] = useState<Turno | 'rota'>(inicial.turnoHabitual ?? 'rota');
  const [valorHora, setValorHora] = useState(inicial.valorHora ? String(inicial.valorHora / 100).replace('.', ',') : '');
  const [activo, setActivo] = useState(inicial.activo ?? true);
  const [error, setError] = useState<string | null>(null);
  const guardar = async () => {
    try {
      await api(inicial.id ? `/empleados/${inicial.id}` : '/empleados', { method: inicial.id ? 'PUT' : 'POST', body: { nombre, turnoHabitual: turno === 'rota' ? null : turno, valorHora: valorHora.trim() ? aCentavos(valorHora) : null, activo } });
      await qc.invalidateQueries({ queryKey: ['empleados'] });
      onCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    }
  };
  return (
    <Dialogo titulo={inicial.id ? inicial.nombre ?? '' : 'Agregar al personal'} onCerrar={onCerrar}>
      <Campo etiqueta="Nombre y apellido"><Entrada value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus /></Campo>
      <Campo etiqueta="Turno habitual" ayuda="Aparece primero al cargar la producción de ese turno.">
        <Opciones<Turno | 'rota'> columnas valor={turno} onChange={setTurno} opciones={[...TURNOS.map((t) => ({ valor: t, titulo: LABEL_TURNO[t] })), { valor: 'rota', titulo: 'Rota' }]} />
      </Campo>
      <Campo etiqueta="Valor de la hora" ayuda="Opcional: para estimar cuánto corresponde pagar según las horas de máquina.">
        <EntradaNumero unidad="$/h" value={valorHora} onChange={(e) => setValorHora(e.target.value)} />
      </Campo>
      {inicial.id && <Opciones columnas valor={activo} onChange={setActivo} opciones={[{ valor: true, titulo: 'Trabaja' }, { valor: false, titulo: 'Ya no trabaja' }]} />}
      <Aviso>{error}</Aviso>
      <div className="acciones">
        <button className="boton secundario" onClick={onCerrar}>Cancelar</button>
        <button className="boton primario" onClick={guardar}>Guardar</button>
      </div>
    </Dialogo>
  );
}

function DatosEmpresa({ editable }: { editable: boolean }) {
  const qc = useQueryClient();
  const { data } = useEmpresa();
  const [d, setD] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  useEffect(() => { if (data && !d) setD({ razonSocial: data.razonSocial, direccion: data.direccion ?? '', telefono: data.telefono ?? '', email: data.email ?? '', cuit: data.cuit ?? '', resumenEmails: data.resumenEmails ?? '', resumenHora: String(data.resumenHora ?? 20), proximoRemito: String(data.proximoRemito ?? '') }); }, [data, d]);
  if (!d) return null;
  const guardar = async () => {
    setError(null); setOk(false);
    try {
      const { resumenHora, proximoRemito, ...resto } = d;
      await api('/empresa', { method: 'PUT', body: { ...Object.fromEntries(Object.entries(resto).map(([k, v]) => [k, v || undefined])), resumenHora: Number(resumenHora) || 20, proximoRemito: Number(proximoRemito) || null } });
      await qc.invalidateQueries({ queryKey: ['empresa'] });
      setOk(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    }
  };
  const campo = (k: string, etiqueta: string) => <Campo etiqueta={etiqueta}><Entrada value={d[k] ?? ''} disabled={!editable} onChange={(e) => setD({ ...d, [k]: e.target.value })} /></Campo>;
  return (
    <section>
      <Cabecera titulo="Datos de la empresa" bajada="Salen en los tickets de cartón y en las etiquetas de los palets." />
      <div className="hoja relleno" style={{ display: 'grid', gap: 14 }}>
        {campo('razonSocial', 'Razón social')}
        {campo('direccion', 'Dirección')}
        {campo('telefono', 'Teléfono')}
        {campo('email', 'Email')}
        {campo('cuit', 'CUIT')}
        <Campo etiqueta="Mandar el resumen diario a" ayuda="Uno o varios mails separados por coma. Vacío = no se manda."><Entrada value={d.resumenEmails ?? ''} disabled={!editable} onChange={(e) => setD({ ...d, resumenEmails: e.target.value })} placeholder="dueno@moldeadoscordoba.com.ar" inputMode="email" /></Campo>
        <Campo etiqueta="Hora del resumen" ayuda="Hora de Argentina (0 a 23)."><EntradaNumero unidad="h" value={d.resumenHora ?? '20'} disabled={!editable} onChange={(e) => setD({ ...d, resumenHora: e.target.value.replace(/\D/g, '').slice(0, 2) })} /></Campo>
        <Campo etiqueta="Próximo número de remito" ayuda="Para seguir con la numeración de los remitos en papel. Solo se puede subir."><EntradaNumero value={d.proximoRemito ?? ''} disabled={!editable} onChange={(e) => setD({ ...d, proximoRemito: e.target.value.replace(/\D/g, '').slice(0, 9) })} /></Campo>
        <Aviso>{error}</Aviso>
        {ok && <Aviso ok>Datos guardados.</Aviso>}
        {editable && <button className="boton primario" style={{ justifySelf: 'start' }} onClick={guardar}>Guardar datos</button>}
      </div>
    </section>
  );
}
