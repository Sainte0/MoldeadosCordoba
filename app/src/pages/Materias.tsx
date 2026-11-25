import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Scale } from 'lucide-react';
import { aMili, estadoStock, formatCantidad, LABEL_TIPO_MP, ORDEN_NIVEL, TIPOS_MP, type TipoMp, type Unidad } from '@moldeados/shared/base';
import { api, nroTicket, useSesion, verMomento } from '../api';
import { useMaterias, type MateriaPrima } from '../datos';
import { Estado } from '../Estado';
import { MateriaRapida } from './MateriaRapida';
import { Aviso, Cabecera, Campo, Cargando, Dialogo, Entrada, EntradaNumero, Opciones } from '../ui';

const MOTIVO: Record<string, string> = { compra: 'Compra', anulacion_compra: 'Compra anulada', ajuste: 'Corrección', consumo: 'Producción', anulacion_consumo: 'Producción anulada' };

export function Materias() {
  const { puede } = useSesion();
  const { data, isLoading } = useMaterias();
  const [editando, setEditando] = useState<Partial<MateriaPrima> | null>(null);
  const [viendo, setViendo] = useState<MateriaPrima | null>(null);
  // Anotar que entró o corregir: el mismo diálogo que en Hoy (una sola forma de hacerlo en toda la app).
  const [rapida, setRapida] = useState<{ m: MateriaPrima; modo: 'entro' | 'corregir' } | null>(null);

  return (
    <div className="ancho">
      <Cabecera titulo="Materia prima" bajada="Lo que hay en planta. Tocá una para anotar que entró o corregir lo que hay.">
        {puede('compras', 2) && <Link to="/pesaje" className="boton secundario"><Scale size={18} aria-hidden /> Entrada de cartón</Link>}
      </Cabecera>
      {isLoading ? <Cargando /> : (
        <div className="hoja filas">
          {data?.map((m) => ({ m, e: estadoStock(m) }))
            .sort((x, y) => Number(!x.m.activo) - Number(!y.m.activo) || ORDEN_NIVEL[x.e.nivel] - ORDEN_NIVEL[y.e.nivel] || x.m.nombre.localeCompare(y.m.nombre))
            .map(({ m, e }) => (
              <button key={m.id} className="fila" onClick={() => setViendo(m)} style={{ opacity: m.activo ? 1 : 0.55 }}>
                <div>
                  <div className="principal">{m.nombre}</div>
                  <div className="chico tenue">{m.activo ? e.detalle : 'Desactivada'}</div>
                </div>
                <div className="derecha">
                  <div className="cifra" style={{ fontSize: '1.3rem' }}>{formatCantidad(e.stockVisible, m.unidad)}</div>
                  {m.activo && <Estado nivel={e.nivel}>{e.titulo}</Estado>}
                </div>
              </button>
            ))}
        </div>
      )}
      {/* Dar de alta una materia prima es de configuración: al pie, no compite con lo diario. */}
      {puede('materias', 3) && <div style={{ marginTop: 16 }}><button className="boton fantasma" onClick={() => setEditando({ tipo: 'tinta', unidad: 'l', activo: true, stockMinimo: 0 })}><Plus size={18} aria-hidden /> Nueva materia prima</button></div>}
      {viendo && <FichaMateria m={viendo} onCerrar={() => setViendo(null)} onEditar={() => { setEditando(viendo); setViendo(null); }} onAnotar={(modo) => { setRapida({ m: viendo, modo }); setViendo(null); }} />}
      {rapida && <MateriaRapida m={rapida.m} inicial={rapida.modo} onCerrar={() => setRapida(null)} />}
      {editando && <EditarMateria inicial={editando} onCerrar={() => setEditando(null)} />}
    </div>
  );
}

interface Movimiento { id: string; cantidad: number; motivo: string; nota: string | null; fecha: string; usuario: string; compraNumero: number | null; compraId: string | null }

function FichaMateria({ m, onCerrar, onEditar, onAnotar }: { m: MateriaPrima; onCerrar: () => void; onEditar: () => void; onAnotar: (modo: 'entro' | 'corregir') => void }) {
  const { puede } = useSesion();
  const { data: movs } = useQuery({ queryKey: ['movimientos', m.id], queryFn: () => api<Movimiento[]>(`/materias/${m.id}/movimientos`) });

  return (
    <Dialogo titulo={m.nombre} onCerrar={onCerrar}>
      <div className="lectura"><span>En stock</span><span className="cifra">{formatCantidad(Math.max(0, m.stock), m.unidad)}</span></div>
      {estadoStock(m).nivel !== 'ok' && <div className={`atencion-item ${estadoStock(m).nivel}`} style={{ gridTemplateColumns: '1fr' }}><div><b>{estadoStock(m).titulo}</b><small>{estadoStock(m).detalle}</small></div></div>}
      {(puede('compras', 2) || puede('materias', 3)) && (
        <div className="acciones-titulo">
          {puede('compras', 2) && <button className="boton primario" onClick={() => onAnotar('entro')}><Plus size={18} aria-hidden /> Anotar que entró</button>}
          {puede('materias', 3) && <button className="boton secundario" onClick={() => onAnotar('corregir')}>Corregir lo que hay</button>}
        </div>
      )}
      <h3>Movimientos</h3>
      <div className="hoja filas">
        {!movs?.length && <p className="tenue" style={{ padding: 16 }}>Sin movimientos todavía.</p>}
        {movs?.map((mv) => (
          <div className="fila" key={mv.id}>
            <div>
              <div className="principal">{MOTIVO[mv.motivo] ?? mv.motivo}{mv.compraId && <> · <Link to={`/compras/${mv.compraNumero}`}>{nroTicket(mv.compraNumero ?? 0)}</Link></>}</div>
              <div className="chico tenue">{verMomento(mv.fecha)} · {mv.usuario}{mv.nota ? ` · ${mv.nota}` : ''}</div>
            </div>
            <span className="cifra" style={{ color: mv.cantidad < 0 ? 'var(--peligro)' : 'var(--accion)' }}>{mv.cantidad > 0 ? '+' : ''}{formatCantidad(mv.cantidad, m.unidad)}</span>
          </div>
        ))}
      </div>
      <div className="acciones">
        {puede('materias', 3) && <button className="boton secundario" onClick={onEditar}>Editar datos</button>}
        <button className="boton secundario" onClick={onCerrar}>Cerrar</button>
      </div>
    </Dialogo>
  );
}

function EditarMateria({ inicial, onCerrar }: { inicial: Partial<MateriaPrima>; onCerrar: () => void }) {
  const qc = useQueryClient();
  const [nombre, setNombre] = useState(inicial.nombre ?? '');
  const [tipo, setTipo] = useState<TipoMp>(inicial.tipo ?? 'tinta');
  const [unidad, setUnidad] = useState<Unidad>(inicial.unidad ?? 'l');
  const [color, setColor] = useState(inicial.color ?? '');
  const [minimo, setMinimo] = useState(inicial.stockMinimo ? String(inicial.stockMinimo / 1000).replace('.', ',') : '');
  const [activo, setActivo] = useState(inicial.activo ?? true);
  const [diasAviso, setDiasAviso] = useState(String(inicial.diasAviso ?? 7));
  const [error, setError] = useState<string | null>(null);

  const guardar = async () => {
    const min = minimo.trim() === '' ? 0 : aMili(minimo);
    if (min === null || min < 0) return setError('El stock mínimo no es válido');
    setError(null);
    try {
      const body = { nombre, tipo, unidad, color: tipo === 'tinta' ? color || undefined : undefined, stockMinimo: min, diasAviso: Number(diasAviso || 0), activo };
      await api(inicial.id ? `/materias/${inicial.id}` : '/materias', { method: inicial.id ? 'PUT' : 'POST', body });
      await qc.invalidateQueries({ queryKey: ['materias'] });
      onCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    }
  };

  return (
    <Dialogo titulo={inicial.id ? `Editar ${inicial.nombre}` : 'Nueva materia prima'} onCerrar={onCerrar}>
      <Campo etiqueta="Nombre" ayuda="Ej.: Tinta azul, Cartón de supermercado"><Entrada value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus /></Campo>
      <Campo etiqueta="Tipo">
        <Opciones columnas valor={tipo} onChange={(t) => { setTipo(t); setUnidad(t === 'carton' ? 'kg' : 'l'); }} opciones={TIPOS_MP.map((t) => ({ valor: t, titulo: LABEL_TIPO_MP[t] }))} />
      </Campo>
      {tipo === 'otro' && <Campo etiqueta="Se mide en"><Opciones columnas valor={unidad} onChange={setUnidad} opciones={[{ valor: 'kg', titulo: 'Kilos' }, { valor: 'l', titulo: 'Litros' }]} /></Campo>}
      {tipo === 'tinta' && <Campo etiqueta="Color"><Entrada value={color} onChange={(e) => setColor(e.target.value)} placeholder="Rojo" /></Campo>}
      <Campo etiqueta="Stock mínimo" ayuda="Debajo de esto se marca como bajo en el inicio. Vacío = sin aviso.">
        <EntradaNumero unidad={unidad === 'kg' ? 'kg' : 'L'} value={minimo} onChange={(e) => setMinimo(e.target.value)} />
      </Campo>
      <Campo etiqueta="Avisar cuando alcance para" ayuda="Según lo que se usó en los últimos 30 días. 0 = no avisar.">
        <EntradaNumero unidad="días" value={diasAviso} onChange={(e) => setDiasAviso(e.target.value.replace(/\D/g, ''))} />
      </Campo>
      {inicial.id && <Opciones columnas valor={activo} onChange={setActivo} opciones={[{ valor: true, titulo: 'Activa' }, { valor: false, titulo: 'Desactivada', detalle: 'No aparece para comprar' }]} />}
      <Aviso>{error}</Aviso>
      <div className="acciones">
        <button className="boton secundario" onClick={onCerrar}>Cancelar</button>
        <button className="boton primario" onClick={guardar}>{inicial.id ? 'Guardar cambios' : 'Agregar'}</button>
      </div>
    </Dialogo>
  );
}
