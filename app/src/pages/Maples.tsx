import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { aMili, formatCantidad, formatPesos, LABEL_TAMANO } from '@moldeados/shared/base';
import { api, hoy, useSesion, verFecha } from '../api';
import { useMaquinas, useMaterias, useVariantes, type Maquina, type Variante } from '../datos';
import { MapleVista, Muestra } from '../MapleVista';
import { Aviso, Cabecera, Campo, Cargando, Dialogo, Entrada, EntradaNumero, Opciones } from '../ui';

// Colores frecuentes de tinta. El rojo es el de los maples de su web; cualquier otro se elige con el selector.
const COLORES = [
  { nombre: 'Natural', hex: null },
  { nombre: 'Rojo', hex: '#b3262a' },
  { nombre: 'Azul', hex: '#1f4fa8' },
  { nombre: 'Verde', hex: '#2f7a3d' },
  { nombre: 'Amarillo', hex: '#e2b21f' },
  { nombre: 'Naranja', hex: '#d9681e' },
  { nombre: 'Negro', hex: '#2a2a2a' },
];

export function Maples() {
  const { puede } = useSesion();
  const { data: variantes, isLoading } = useVariantes();
  const { data: maquinas } = useMaquinas();
  const [editando, setEditando] = useState<Partial<Variante> | null>(null);
  const [maquina, setMaquina] = useState<Partial<Maquina> | null>(null);
  const edita = puede('productos', 3);
  // El precio de lista de cada maple, a la vista con el producto (se cambia en Ajustes › Precios).
  const { data: precios } = useQuery({ queryKey: ['precios'], queryFn: () => api<{ id: string; precioMaple: number }[]>('/precios'), enabled: puede('ventas') });
  const precioDe = (id: string) => precios?.find((x) => x.id === id)?.precioMaple ?? 0;

  return (
    <div className="ancho" style={{ display: 'grid', gap: 20 }}>
      <Cabecera titulo="Maples y máquinas" bajada="Los códigos de maple con su color y su receta (cuánto consume por hora), y las máquinas con su service. Con esto se calcula cada parte." />
      <section style={{ display: 'grid', gap: 12 }}>
        <div className="titulo-seccion">
          <h2>Códigos de maple</h2>
          {precios && <Link to="/precios" className="chico">Cambiar precios</Link>}
          {edita && <button className="boton primario" onClick={() => setEditando({ tamano: 'grande', maplesPorPaquete: 60, maplesPorHora: 0, activo: true, receta: [], colorHex: null })}><Plus size={18} aria-hidden /> Nuevo código</button>}
        </div>
        {isLoading ? <Cargando /> : (
          <div className="hoja filas">
            {variantes?.map((v) => (
              <button key={v.id} className="fila" onClick={() => setEditando(v)} style={{ opacity: v.activo ? 1 : 0.55 }}>
                <div className="con-muestra">
                  <Muestra color={v.colorHex} grande />
                  <div>
                    <div className="principal">{v.codigo} <span className="tenue" style={{ fontWeight: 400 }}>{v.nombre}</span></div>
                    <div className="chico tenue">{v.maquina} · {v.maplesPorHora ? `${v.maplesPorHora} maples/h` : 'Sin dato de maples/h'} · {v.receta.length ? v.receta.map((r) => `${r.nombre} ${formatCantidad(r.cantidadPorHora, r.unidad)}/h`).join(', ') : 'Sin receta'}</div>
                  </div>
                </div>
                <span className="derecha" style={{ display: 'grid', gap: 4, justifyItems: 'end' }}>
                  {precios && (precioDe(v.id) ? <span className="cifra">{formatPesos(precioDe(v.id))}<small className="tenue" style={{ fontWeight: 400 }}> /maple</small></span> : <span className="marca-texto alerta">Sin precio</span>)}
                  {!v.receta.length && v.activo && <span className="marca-texto alerta">Falta la receta</span>}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section style={{ display: 'grid', gap: 12 }}>
        <div className="titulo-seccion">
          <h2>Máquinas</h2>
          {edita && <button className="boton secundario" onClick={() => setMaquina({ activo: true, serviceCadaHoras: null, horasDesdeService: 0 })}><Plus size={18} aria-hidden /> Agregar máquina</button>}
        </div>
        <div className="hoja filas">
          {maquinas?.map((m) => (
            <button key={m.id} className="fila" onClick={() => setMaquina(m)} style={{ opacity: m.activo ? 1 : 0.55 }}>
              <div>
                <div className="principal">{m.codigo} {m.leTocaService && <span className={`marca-texto ${m.servicePasado ? 'peligro' : 'alerta'}`}>{m.servicePasado ? 'Service vencido' : 'Le toca service'}</span>}</div>
                <div className="chico tenue">{m.nombre} · {m.horasDesdeService} h trabajadas{m.ultimoService ? ` desde el service del ${verFecha(m.ultimoService)}` : ''}{m.serviceCadaHoras ? ` · service cada ${m.serviceCadaHoras} h` : ''}</div>
              </div>
              <span className="chico tenue">{variantes?.filter((v) => v.maquinaId === m.id).length ?? 0} códigos</span>
            </button>
          ))}
        </div>
      </section>

      {editando && <EditarVariante inicial={editando} editable={edita} onCerrar={() => setEditando(null)} />}
      {maquina && <EditarMaquina inicial={maquina} onCerrar={() => setMaquina(null)} />}
    </div>
  );
}

const aTexto = (mili: number) => String(mili / 1000).replace('.', ',');

// Código y nombre que salen del tamaño y el color: MGR-ROJ / "Maple grande rojo". Natural = sin color.
const sinAcentos = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export const codigoSugerido = (tamano: 'chico' | 'grande', color: string | null) =>
  `M${tamano === 'chico' ? 'CH' : 'GR'}-${color?.trim() ? sinAcentos(color.trim()).replace(/[^a-z]/gi, '').slice(0, 3).toUpperCase() : 'NAT'}`;
export const nombreSugerido = (tamano: 'chico' | 'grande', color: string | null) => `Maple ${tamano} ${color?.trim() ? color.trim().toLowerCase() : 'natural'}`;

function EditarVariante({ inicial, editable, onCerrar }: { inicial: Partial<Variante>; editable: boolean; onCerrar: () => void }) {
  const qc = useQueryClient();
  const { data: maquinas } = useMaquinas();
  const { data: materias } = useMaterias();
  const [v, setV] = useState({
    codigo: inicial.codigo ?? '', nombre: inicial.nombre ?? '', tamano: inicial.tamano ?? 'grande', color: inicial.color ?? '',
    colorHex: inicial.colorHex ?? null, maquinaId: inicial.maquinaId ?? null as string | null,
    maplesPorPaquete: String(inicial.maplesPorPaquete ?? 60), maplesPorHora: inicial.maplesPorHora ? String(inicial.maplesPorHora) : '', activo: inicial.activo ?? true,
  });
  const [receta, setReceta] = useState((inicial.receta ?? []).map((r) => ({ materiaPrimaId: r.materiaPrimaId, cantidad: aTexto(r.cantidadPorHora) })));
  const [error, setError] = useState<string | null>(null);
  // Al cambiar tamaño o color, el código y el nombre los acompañan, salvo que alguien los haya escrito a mano
  // (si ya no coinciden con lo que sale del tamaño y el color de antes, se respetan).
  const set = (c: Partial<typeof v>) => {
    const n = { ...v, ...c };
    const colorDe = (x: typeof v) => (x.colorHex ? x.color : null);
    if ('color' in c || 'colorHex' in c || 'tamano' in c) {
      if (!v.codigo || v.codigo === codigoSugerido(v.tamano, colorDe(v))) n.codigo = codigoSugerido(n.tamano, colorDe(n));
      if (!v.nombre || v.nombre.toLowerCase() === nombreSugerido(v.tamano, colorDe(v)).toLowerCase()) n.nombre = nombreSugerido(n.tamano, colorDe(n));
    }
    setV(n);
  };
  const cambioIdentidad = !!inicial.id && (v.colorHex !== (inicial.colorHex ?? null) || v.tamano !== inicial.tamano);
  const libres = (materias ?? []).filter((m) => m.activo && !receta.some((r) => r.materiaPrimaId === m.id));

  const guardar = async () => {
    setError(null);
    const items = receta.map((r) => ({ materiaPrimaId: r.materiaPrimaId, cantidadPorHora: aMili(r.cantidad) }));
    if (items.some((i) => i.cantidadPorHora === null || i.cantidadPorHora <= 0)) return setError('Revisá las cantidades de la receta');
    try {
      const body = {
        codigo: v.codigo, nombre: v.nombre, tamano: v.tamano, color: v.colorHex ? v.color || undefined : undefined, colorHex: v.colorHex,
        maquinaId: v.maquinaId, maplesPorPaquete: Number(v.maplesPorPaquete), maplesPorHora: Number(v.maplesPorHora || 0), activo: v.activo, receta: items,
      };
      await api(inicial.id ? `/variantes/${inicial.id}` : '/variantes', { method: inicial.id ? 'PUT' : 'POST', body });
      await qc.invalidateQueries({ queryKey: ['variantes'] });
      onCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    }
  };

  return (
    <Dialogo titulo={inicial.id ? `${inicial.codigo}` : 'Nuevo código de maple'} onCerrar={onCerrar}>
      <MapleVista color={v.colorHex} />
      <fieldset disabled={!editable} style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 18 }}>
        <Campo etiqueta="Color">
          <div className="colores">
            {COLORES.map((c) => (
              <button key={c.nombre} type="button" title={c.nombre} aria-label={c.nombre} aria-pressed={v.colorHex === c.hex}
                style={{ background: c.hex ?? '#bfae90' }} onClick={() => set({ colorHex: c.hex, color: c.hex ? c.nombre : '' })} />
            ))}
            <label>
              <input type="color" value={v.colorHex ?? '#bfae90'} onChange={(e) => set({ colorHex: e.target.value, color: COLORES.some((c) => c.nombre === v.color) ? '' : v.color })} aria-label="Otro color" />
              Otro
            </label>
          </div>
        </Campo>
        {v.colorHex && <Campo etiqueta="Nombre del color"><Entrada value={v.color} onChange={(e) => set({ color: e.target.value })} placeholder="Rojo" /></Campo>}
        <Campo etiqueta="Tamaño"><Opciones columnas valor={v.tamano} onChange={(tamano) => set({ tamano })} opciones={(['chico', 'grande'] as const).map((t) => ({ valor: t, titulo: LABEL_TAMANO[t] }))} /></Campo>
        {cambioIdentidad && <p className="atencion-item atencion" style={{ display: 'block' }}>Cambiaste el {v.tamano !== inicial.tamano ? 'tamaño' : 'color'}: el código y el nombre se actualizan solos. Si ya se fabricaron o vendieron maples de {inicial.codigo}, conviene crear un código nuevo y marcar este como discontinuado, así la historia sigue diciendo lo que realmente se hizo. Las etiquetas ya impresas dicen {inicial.codigo}.</p>}
        <Campo etiqueta="Código" ayuda="El que va en la etiqueta. Se arma solo con el tamaño y el color; podés cambiarlo."><Entrada value={v.codigo} onChange={(e) => set({ codigo: e.target.value.toUpperCase() })} /></Campo>
        <Campo etiqueta="Nombre"><Entrada value={v.nombre} onChange={(e) => set({ nombre: e.target.value })} placeholder="Maple grande rojo" /></Campo>
        <Campo etiqueta="Máquina">
          <Opciones columnas valor={v.maquinaId} onChange={(maquinaId) => set({ maquinaId })} opciones={(maquinas ?? []).filter((m) => m.activo || m.id === v.maquinaId).map((m) => ({ valor: m.id, titulo: m.codigo, detalle: m.nombre }))} />
        </Campo>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Campo etiqueta="Maples por paquete"><EntradaNumero value={v.maplesPorPaquete} onChange={(e) => set({ maplesPorPaquete: e.target.value.replace(/\D/g, '') })} /></Campo>
          <Campo etiqueta="Maples por hora" ayuda="Lo que hace la máquina"><EntradaNumero value={v.maplesPorHora} onChange={(e) => set({ maplesPorHora: e.target.value.replace(/\D/g, '') })} /></Campo>
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          <b>Receta: consumo por hora de máquina</b>
          <p className="chico tenue">Con esto se calcula cuánto se gastó en cada parte. El operario solo corrige si fue distinto.</p>
          {receta.map((r, i) => {
            const m = materias?.find((x) => x.id === r.materiaPrimaId);
            return (
              <div key={r.materiaPrimaId} style={{ display: 'grid', gridTemplateColumns: '1fr 150px auto', gap: 8, alignItems: 'center' }}>
                <span>{m?.nombre}</span>
                <EntradaNumero unidad={m?.unidad === 'kg' ? 'kg/h' : 'L/h'} value={r.cantidad} aria-label={`${m?.nombre} por hora`}
                  onChange={(e) => setReceta(receta.map((x, j) => (j === i ? { ...x, cantidad: e.target.value } : x)))} />
                <button type="button" className="boton icono" aria-label={`Quitar ${m?.nombre}`} onClick={() => setReceta(receta.filter((_, j) => j !== i))}><Trash2 size={18} /></button>
              </div>
            );
          })}
          {libres.length > 0 && (
            <div className="colores">
              {libres.map((m) => (
                <button key={m.id} type="button" className="boton secundario" style={{ width: 'auto', height: 'auto', borderRadius: 8, border: 0 }} onClick={() => setReceta([...receta, { materiaPrimaId: m.id, cantidad: '' }])}>
                  <Plus size={16} aria-hidden /> {m.nombre}
                </button>
              ))}
            </div>
          )}
        </div>
        {inicial.id && <Opciones columnas valor={v.activo} onChange={(activo) => set({ activo })} opciones={[{ valor: true, titulo: 'Se fabrica' }, { valor: false, titulo: 'Discontinuado' }]} />}
      </fieldset>
      <Aviso>{error}</Aviso>
      <div className="acciones">
        <button className="boton secundario" onClick={onCerrar}>{editable ? 'Cancelar' : 'Cerrar'}</button>
        {editable && <button className="boton primario" onClick={guardar}>{inicial.id ? 'Guardar cambios' : 'Agregar código'}</button>}
      </div>
    </Dialogo>
  );
}

function EditarMaquina({ inicial, onCerrar }: { inicial: Partial<Maquina>; onCerrar: () => void }) {
  const qc = useQueryClient();
  const { puede } = useSesion();
  const edita = puede('productos', 3);
  const registraService = puede('produccion', 3) || edita;
  const [codigo, setCodigo] = useState(inicial.codigo ?? '');
  const [nombre, setNombre] = useState(inicial.nombre ?? '');
  const [activo, setActivo] = useState(inicial.activo ?? true);
  const [cada, setCada] = useState(inicial.serviceCadaHoras ? String(inicial.serviceCadaHoras) : '');
  const [service, setService] = useState<{ fecha: string; nota: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { data: historial } = useQuery({ queryKey: ['services', inicial.id], queryFn: () => api<{ id: string; fecha: string; nota: string | null; usuario: string }[]>(`/maquinas/${inicial.id}/services`), enabled: !!inicial.id });
  const registrar = async () => {
    if (!service) return;
    try {
      await api(`/maquinas/${inicial.id}/service`, { method: 'POST', body: { fecha: service.fecha, nota: service.nota || undefined } });
      await qc.invalidateQueries();
      onCerrar();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo registrar'); }
  };
  const guardar = async () => {
    try {
      await api(inicial.id ? `/maquinas/${inicial.id}` : '/maquinas', { method: inicial.id ? 'PUT' : 'POST', body: { codigo, nombre, activo, serviceCadaHoras: cada ? Number(cada) : null } });
      await qc.invalidateQueries({ queryKey: ['maquinas'] });
      onCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    }
  };
  return (
    <Dialogo titulo={inicial.id ? `Máquina ${inicial.codigo}` : 'Nueva máquina'} onCerrar={onCerrar}>
      <Campo etiqueta="Código"><Entrada value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="MP-3" autoFocus /></Campo>
      {inicial.id && (
        <div className="lectura"><span>Horas trabajadas desde el último service</span><span className="cifra">{inicial.horasDesdeService} h</span></div>
      )}
      <fieldset disabled={!edita} style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 14 }}>
        <Campo etiqueta="Nombre"><Entrada value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Papelera mediana" /></Campo>
        <Campo etiqueta="Service cada" ayuda="Horas de trabajo según los partes. Vacío = sin aviso."><EntradaNumero unidad="h" value={cada} onChange={(e) => setCada(e.target.value.replace(/\D/g, ''))} /></Campo>
        {inicial.id && <Opciones columnas valor={activo} onChange={setActivo} opciones={[{ valor: true, titulo: 'En uso' }, { valor: false, titulo: 'Fuera de uso' }]} />}
      </fieldset>
      {inicial.id && registraService && (service ? (
        <div className="hoja relleno" style={{ display: 'grid', gap: 12 }}>
          <b>Registrar service</b>
          <Campo etiqueta="Fecha"><Entrada type="date" value={service.fecha} max={hoy()} onChange={(e) => setService({ ...service, fecha: e.target.value })} /></Campo>
          <Campo etiqueta="Qué se hizo" ayuda="Opcional"><Entrada value={service.nota} onChange={(e) => setService({ ...service, nota: e.target.value })} placeholder="Cambio de malla, engrase…" /></Campo>
          <button className="boton primario" onClick={registrar}>Guardar service</button>
        </div>
      ) : <button className="boton secundario" style={{ justifySelf: 'start' }} onClick={() => setService({ fecha: hoy(), nota: '' })}>Registrar service</button>)}
      {!!historial?.length && (
        <div className="chico tenue">Services: {historial.map((s) => `${verFecha(s.fecha)}${s.nota ? ` (${s.nota})` : ''}`).join(' · ')}</div>
      )}
      <Aviso>{error}</Aviso>
      <div className="acciones">
        <button className="boton secundario" onClick={onCerrar}>{edita ? 'Cancelar' : 'Cerrar'}</button>
        {edita && <button className="boton primario" onClick={guardar}>Guardar</button>}
      </div>
    </Dialogo>
  );
}
