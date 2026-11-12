import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { aMili, aMinutos, consumoTeorico, formatCantidad, formatMinutos, LABEL_TURNO, paquetesTeoricos, TURNOS, type Turno } from '@moldeados/shared/base';
import { hoy, verFecha } from '../api';
import { enviarOGuardar } from '../cola';
import { useEmpleados, useMaquinas, useMaterias, useVariantes } from '../datos';
import { Muestra } from '../MapleVista';
import { Asistente, Campo, Entrada, EntradaNumero, Opciones, type Paso } from '../ui';

const turnoActual = (): Turno => (Number(new Intl.DateTimeFormat('es-AR', { hour: 'numeric', hour12: false, timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())) < 14 ? 'manana' : 'tarde');

/** Producción del turno: lo que hizo una máquina en un turno. Descuenta la materia prima según la receta. */
export function NuevoParte() {
  const navegar = useNavigate();
  const qc = useQueryClient();
  const { data: maquinas } = useMaquinas();
  const { data: variantes } = useVariantes();
  const { data: empleados } = useEmpleados();
  const { data: materias } = useMaterias();

  const [fecha, setFecha] = useState(hoy());
  const [turno, setTurno] = useState<Turno>(turnoActual());
  const [maquinaId, setMaquinaId] = useState<string | null>(null);
  const [varianteId, setVarianteId] = useState<string | null>(null);
  const [personal, setPersonal] = useState<string[]>([]);
  const [tocoPersonal, setTocoPersonal] = useState(false);
  const [horas, setHoras] = useState('');
  const [pulpeadas, setPulpeadas] = useState('');
  const [paquetes, setPaquetes] = useState('');
  const [correcciones, setCorrecciones] = useState<Record<string, string>>({});
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activas = (maquinas ?? []).filter((m) => m.activo);
  const deLaMaquina = (variantes ?? []).filter((v) => v.activo && v.maquinaId === maquinaId);
  const variante = variantes?.find((v) => v.id === varianteId);
  const minutos = aMinutos(horas);
  const nPaquetes = paquetes.trim() === '' ? null : Number(paquetes.replace(/\./g, ''));
  const esperado = variante && minutos ? paquetesTeoricos(variante.maplesPorHora, minutos, variante.maplesPorPaquete) : null;

  const consumos = useMemo(() => (variante && minutos ? variante.receta.map((r) => {
    const teorico = consumoTeorico(r.cantidadPorHora, minutos);
    const corregido = correcciones[r.materiaPrimaId];
    const real = corregido !== undefined && corregido.trim() !== '' ? aMili(corregido) : teorico;
    const stock = materias?.find((m) => m.id === r.materiaPrimaId)?.stock ?? 0;
    return { ...r, teorico, real, stock };
  }) : []), [variante, minutos, correcciones, materias]);

  // Arranca con la gente del turno marcada; si alguien tocó la lista, no se pisa más.
  useEffect(() => {
    if (!tocoPersonal && empleados) setPersonal(empleados.filter((e) => e.activo && e.turnoHabitual === turno).map((e) => e.id));
  }, [turno, empleados, tocoPersonal]);

  const pasos: Paso[] = [
    {
      titulo: '¿Qué turno es?',
      ayuda: 'Una carga por máquina y por turno. Si cargás un turno de otro día, cambiá la fecha.',
      contenido: (
        <>
          <Opciones columnas valor={turno} onChange={setTurno} opciones={TURNOS.map((t) => ({ valor: t, titulo: LABEL_TURNO[t] }))} />
          <Campo etiqueta="Fecha" ayuda={fecha === hoy() ? 'Hoy' : verFecha(fecha)}><Entrada type="date" value={fecha} max={hoy()} onChange={(e) => setFecha(e.target.value)} /></Campo>
        </>
      ),
      listo: true,
    },
    {
      titulo: '¿Qué máquina?',
      ayuda: 'La máquina en la que se hizo.',
      contenido: <Opciones valor={maquinaId} onChange={(id) => { setMaquinaId(id); setVarianteId(null); }} opciones={activas.map((m) => ({ valor: m.id, titulo: m.codigo, detalle: m.nombre }))} />,
      listo: maquinaId ? true : 'Elegí la máquina',
      rapido: true,
    },
    {
      titulo: '¿Qué maple se hizo?',
      ayuda: 'Si en el turno se cambió de color, cargá la producción de cada código por separado.',
      contenido: deLaMaquina.length ? (
        <div className="opciones">
          {deLaMaquina.map((v) => (
            <button type="button" key={v.id} className="opcion" aria-pressed={v.id === varianteId} onClick={() => setVarianteId(v.id)}>
              <Muestra color={v.colorHex} grande />
              <span><b>{v.codigo}</b><small>{v.nombre}{!v.receta.length && ' · sin receta: no descuenta materia prima'}</small></span>
            </button>
          ))}
        </div>
      ) : <p className="tenue">Esta máquina no tiene códigos de maple cargados. Se agregan en Ajustes › Maples y máquinas.</p>,
      listo: varianteId ? true : 'Elegí el maple',
      rapido: true,
    },
    {
      titulo: '¿Quiénes trabajaron?',
      ayuda: 'Ya marcamos a los de este turno. Tocá para sacar a quien faltó o sumar a quien vino de otro turno.',
      contenido: (
        <div className="opciones dos">
          {(empleados ?? []).filter((e) => e.activo).sort((a, b) => Number(b.turnoHabitual === turno) - Number(a.turnoHabitual === turno)).map((e) => (
            <button type="button" key={e.id} className="opcion" aria-pressed={personal.includes(e.id)} onClick={() => { setTocoPersonal(true); setPersonal(personal.includes(e.id) ? personal.filter((x) => x !== e.id) : [...personal, e.id]); }}>
              <span className="marca-op" aria-hidden /><span><b>{e.nombre}</b>{e.turnoHabitual && <small>Turno {LABEL_TURNO[e.turnoHabitual].toLowerCase()}</small>}</span>
            </button>
          ))}
          {!empleados?.length && <p className="tenue">No hay personal de planta cargado. <Link to="/equipo?ver=planta">Agregalo en Ajustes › Equipo y permisos › Planta</Link>.</p>}
        </div>
      ),
      listo: personal.length ? true : 'Marcá al menos una persona',
    },
    {
      titulo: '¿Cuánto trabajó la máquina?',
      ayuda: 'Horas de máquina andando, sin contar paradas largas. Podés escribir 7,5 o 7:30.',
      contenido: (
        <>
          <Campo etiqueta="Horas"><EntradaNumero enorme unidad="h" value={horas} onChange={(e) => setHoras(e.target.value)} autoFocus /></Campo>
          {minutos !== null && minutos > 0 && <p className="tenue">{formatMinutos(minutos)}</p>}
          <Campo etiqueta="Pulpeadas" ayuda="Cuántas cargas hizo el pulper"><EntradaNumero enorme value={pulpeadas} onChange={(e) => setPulpeadas(e.target.value.replace(/\D/g, ''))} /></Campo>
        </>
      ),
      listo: minutos === null || minutos <= 0 ? 'Ingresá las horas' : minutos > 1440 ? 'Revisá las horas' : true,
    },
    {
      titulo: '¿Cuántos paquetes salieron?',
      ayuda: `Paquetes de ${variante?.maplesPorPaquete ?? 60} maples, contados al final del turno.`,
      contenido: (
        <>
          <EntradaNumero enorme unidad="paq." value={paquetes} onChange={(e) => setPaquetes(e.target.value.replace(/[^\d.]/g, ''))} autoFocus aria-label="Paquetes" />
          {nPaquetes !== null && variante && (
            <div className="lectura"><span>Maples</span><span className="cifra">{(nPaquetes * variante.maplesPorPaquete).toLocaleString('es-AR')}</span></div>
          )}
          {esperado !== null && <p className="tenue">Según la máquina deberían salir unos <b>{esperado}</b> paquetes{nPaquetes !== null && esperado > 0 ? ` (rendimiento ${Math.round((nPaquetes / esperado) * 100)} %)` : ''}.</p>}
        </>
      ),
      listo: nPaquetes === null || Number.isNaN(nPaquetes) ? 'Ingresá los paquetes (0 si no salió nada)' : true,
    },
    ...(consumos.length === 0 ? [] : [{
      titulo: '¿Se usó lo de siempre?',
      ayuda: 'Esto es lo que gasta la receta en ese tiempo. Si se usó distinto, corregí solo esa línea.',
      contenido: consumos.length ? (
        <div className="hoja filas">
          {consumos.map((c) => (
            <div className="fila" key={c.materiaPrimaId} style={{ gridTemplateColumns: '1fr 170px' }}>
              <div>
                <div className="principal">{c.nombre}</div>
                <div className="chico tenue">Receta: {formatCantidad(c.teorico, c.unidad)} · en stock {formatCantidad(c.stock, c.unidad)}</div>
                {c.real !== null && c.real > c.stock && <span className="atencion-item atencion" style={{ display: "block", marginTop: 6 }}>No alcanza lo que hay cargado: avisá a administración que falta cargar una compra</span>}
              </div>
              <EntradaNumero unidad={c.unidad === 'kg' ? 'kg' : 'L'} placeholder={formatCantidad(c.teorico, c.unidad).split(' ')[0]} aria-label={`${c.nombre} usado`}
                value={correcciones[c.materiaPrimaId] ?? ''} onChange={(e) => setCorrecciones({ ...correcciones, [c.materiaPrimaId]: e.target.value })} />
            </div>
          ))}
        </div>
      ) : null,
      listo: consumos.some((c) => c.real === null || c.real < 0) ? 'Revisá las cantidades corregidas' : true,
    } as Paso]),
    {
      titulo: 'Revisá y guardá',
      ayuda: 'Al guardar se suman los paquetes al stock de maples y se descuenta la materia prima.',
      contenido: (
        <>
          <dl className="resumen hoja relleno">
            <dt>Turno</dt><dd>{LABEL_TURNO[turno]}, {verFecha(fecha)}</dd>
            <dt>Máquina</dt><dd>{maquinas?.find((m) => m.id === maquinaId)?.codigo}</dd>
            <dt>Maple</dt><dd className="con-muestra"><Muestra color={variante?.colorHex ?? null} /> {variante?.codigo}</dd>
            <dt>Personal</dt><dd>{empleados?.filter((e) => personal.includes(e.id)).map((e) => e.nombre).join(', ')}</dd>
            <dt>Tiempo</dt><dd>{minutos && formatMinutos(minutos)}{pulpeadas && ` · ${pulpeadas} pulpeadas`}</dd>
            {consumos.map((c) => <Fragment key={c.materiaPrimaId}><dt>{c.nombre}</dt><dd>{c.real !== null && formatCantidad(c.real, c.unidad)}{c.real !== c.teorico && ' (corregido)'}</dd></Fragment>)}
          </dl>
          <div className="lectura"><span>Paquetes</span><span className="cifra">{nPaquetes}</span></div>
          <Campo etiqueta="Observaciones" ayuda="Opcional: paradas, fallas, cambios de molde."><textarea className="entrada" value={notas} onChange={(e) => setNotas(e.target.value)} /></Campo>
        </>
      ),
      listo: true,
    },
  ];

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      const consumoReal = consumos.filter((c) => c.real !== c.teorico).map((c) => ({ materiaPrimaId: c.materiaPrimaId, cantidad: c.real }));
      const body = { fecha, turno, maquinaId, varianteId, empleadoIds: personal, minutos, pulpeadas: Number(pulpeadas || 0), paquetes: nPaquetes, consumoReal, notas: notas || undefined };
      const r = await enviarOGuardar<{ id: string }>('/partes', body, `producción ${maquinas?.find((m) => m.id === maquinaId)?.codigo ?? ''} ${LABEL_TURNO[turno].toLowerCase()}`);
      if (r.guardado) { navegar('/', { replace: true, state: { aviso: 'Producción guardada en el teléfono: se sube solo cuando vuelva la señal.' } }); return; }
      await qc.invalidateQueries();
      navegar(`/produccion/${r.data.id}?nuevo=1`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
      setGuardando(false);
    }
  };

  return <Asistente proceso="parte" pasos={pasos} onTerminar={guardar} textoTerminar="Guardar producción" guardando={guardando} error={error} onCancelar={() => navegar('/produccion')} />;
}
